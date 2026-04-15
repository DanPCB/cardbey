/**
 * Starter Kit Service
 * Generates a full starter kit of templates for a new business
 * Creates multiple content items (hero, menu, promo, social) from system templates
 * 
 * Phase 2: Supports configurable use cases and multiple templates per use case
 */

import { PrismaClient } from '@prisma/client';
import { instantiateCreativeTemplateForContext } from './miOrchestratorService.js';

const prisma = new PrismaClient();

export interface StarterKitTemplateConfig {
  useCase: string;               // "hero" | "menu" | "promo" | "social"
  count: number;                 // how many variants per use case (usually 1)
}

export interface GeneratedStarterItem {
  contentId: string;
  templateId: string;
  useCase: string;
  name?: string;
}

export interface GenerateStarterKitParams {
  businessId: string;
  businessType?: string;          // e.g. "cafe", "restaurant", "bakery"
  styleTags?: string[];
  locale?: string;
  kitConfig?: StarterKitTemplateConfig[]; // Optional: custom kit configuration
  tenantId?: string;              // Optional: will be fetched from business if not provided
  userId?: string;                // Optional: will be fetched from business if not provided
}

/**
 * Default kit configuration
 * Defines which use cases to generate and how many templates per use case
 */
const defaultKitConfig: StarterKitTemplateConfig[] = [
  { useCase: 'hero', count: 1 },
  { useCase: 'menu', count: 1 },
  { useCase: 'promo', count: 1 },
  { useCase: 'social', count: 1 },
];

/**
 * Generate a full starter kit for a business
 * Instantiates multiple templates based on business type, style, and kit configuration
 */
export async function generateStarterKitForBusiness(
  params: GenerateStarterKitParams
): Promise<GeneratedStarterItem[]> {
  const { 
    businessId, 
    businessType, 
    styleTags = [], 
    locale = 'en', 
    tenantId: providedTenantId,
    userId: providedUserId,
    kitConfig = defaultKitConfig,
  } = params;

  const starterItems: GeneratedStarterItem[] = [];

  // Get business info for context and tenant/user IDs
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      type: true,
      userId: true, // For tenant/user context
      primaryColor: true,
      secondaryColor: true,
      tagline: true,
      heroText: true,
      stylePreferences: true,
    },
  });

  if (!business) {
    console.warn(`[StarterKit] Business not found: ${businessId}`);
    return [];
  }

  // Use provided tenantId/userId or fetch from business
  // In this codebase, tenantId is typically the same as userId (owner of the business)
  const tenantId = providedTenantId || business.userId;
  const userId = providedUserId || business.userId;

  if (!tenantId || !userId) {
    console.warn(`[StarterKit] Missing tenantId or userId for business ${businessId}`);
    return [];
  }

  // Use business.type if businessType not provided
  const effectiveBusinessType = businessType || business.type || 'general';

  // Parse style preferences
  let businessStyleTags: string[] = [];
  if (business.stylePreferences) {
    try {
      const prefs = typeof business.stylePreferences === 'string'
        ? JSON.parse(business.stylePreferences)
        : business.stylePreferences;
      businessStyleTags = prefs.styleTags || [];
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Combine provided styleTags with business styleTags
  const allStyleTags = [...new Set([...styleTags, ...businessStyleTags])];

  // For each use case in kit config, find and instantiate matching templates
  for (const config of kitConfig) {
    const { useCase, count } = config;

    try {
      // Find matching templates for this use case
      const templates = await findTemplatesForUseCase(
        useCase,
        effectiveBusinessType,
        allStyleTags,
        count
      );

      if (templates.length === 0) {
        console.warn(
          `[StarterKit] No templates found for useCase: ${useCase}, businessType: ${effectiveBusinessType}. Continuing with other use cases.`
        );
        continue; // Don't fail entire kit if one use case has no matches
      }

      // Instantiate each selected template
      for (const template of templates) {
        try {
          const result = await instantiateCreativeTemplateForContext({
            templateContentId: template.id,
            tenantId,
            storeId: businessId,
            channel: null, // Let template decide
            orientation: null, // Let template decide
            userId,
            autoFillText: true, // Auto-fill with business data
          });

          starterItems.push({
            contentId: result.content.id,
            templateId: result.templateId || template.id,
            useCase,
            name: template.name,
          });

          console.log(
            `[StarterKit] ✅ Generated ${useCase} content: ${result.content.id} from template: ${template.name} (${template.id})`
          );
        } catch (error) {
          console.error(
            `[StarterKit] Failed to instantiate template ${template.id} for useCase ${useCase}:`,
            error
          );
          // Continue with other templates even if one fails
        }
      }
    } catch (error) {
      console.error(`[StarterKit] Error processing useCase ${useCase}:`, error);
      // Continue with other use cases even if one fails
    }
  }

  console.log(`[StarterKit] ✅ Generated ${starterItems.length} starter kit items for business ${businessId}`);
  return starterItems;
}

/**
 * Find multiple system templates matching the use case, business type, and style tags
 * Returns up to `count` templates, ordered by relevance
 */
async function findTemplatesForUseCase(
  useCase: string,
  businessType: string,
  styleTags: string[] = [],
  count: number = 1
): Promise<Array<{ id: string; name: string }>> {
  try {
    // Build query conditions
    const where: any = {
      isSystem: true,
      isActive: true,
    };

    // Try to match by useCases field (JSON array)
    // Since Prisma doesn't support JSON array contains directly, we'll query all system templates
    // and filter in memory for now (can be optimized later with raw SQL if needed)
    const templates = await prisma.creativeTemplate.findMany({
      where: {
        isSystem: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        useCases: true,
        businessCategories: true,
        styleTags: true,
        tags: true,
      },
      take: 50, // Limit to avoid loading too many
    });

    // Helper to parse JSON fields (handles both string and array formats)
    const parseJsonField = (field: any): any[] => {
      if (!field) return [];
      if (Array.isArray(field)) return field;
      if (typeof field === 'string') {
        try {
          const parsed = JSON.parse(field);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    // Filter templates that match the use case
    const matchingTemplates = templates.filter((template) => {
      // Check useCases
      let matchesUseCase = false;
      const useCases = parseJsonField(template.useCases);
      if (useCases.length > 0) {
        matchesUseCase = useCases.includes(useCase);
      } else {
        // Fallback: check tags for use case hints
        const tags = parseJsonField(template.tags);
        matchesUseCase = tags.some((tag: string) => 
          tag.toLowerCase().includes(useCase.toLowerCase())
        );
      }

      if (!matchesUseCase) return false;

      // Check business type if provided
      if (businessType) {
        const categories = parseJsonField(template.businessCategories);
        if (categories.length > 0) {
          // If template has specific categories, at least one must match
          const normalizedBusinessType = businessType.toLowerCase();
          const matchesBusinessType = categories.some((cat: string) => 
            cat.toLowerCase() === normalizedBusinessType || 
            normalizedBusinessType.includes(cat.toLowerCase()) ||
            cat.toLowerCase() === 'general' // "general" category matches all
          );
          if (!matchesBusinessType) {
            // If template has specific categories but none match, skip it
            return false;
          }
        }
        // If template has no categories specified, it's considered general and matches all
      }

      // Style tags are optional - we don't filter out if no match
      // But we'll use them for scoring/ordering later

      return true;
    });

    // Helper to parse JSON fields for scoring
    const parseJsonFieldForScoring = (field: any): any[] => {
      if (!field) return [];
      if (Array.isArray(field)) return field;
      if (typeof field === 'string') {
        try {
          const parsed = JSON.parse(field);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    // Sort by relevance (templates with matching business type and style tags first)
    matchingTemplates.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Business type match
      if (businessType) {
        const aCategories = parseJsonFieldForScoring(a.businessCategories);
        const bCategories = parseJsonFieldForScoring(b.businessCategories);
        const normalizedBusinessType = businessType.toLowerCase();
        
        if (aCategories.some((cat: string) => cat.toLowerCase() === normalizedBusinessType)) scoreA += 2;
        if (bCategories.some((cat: string) => cat.toLowerCase() === normalizedBusinessType)) scoreB += 2;
      }

      // Style tag match
      if (styleTags.length > 0) {
        const aStyleTags = parseJsonFieldForScoring(a.styleTags);
        const bStyleTags = parseJsonFieldForScoring(b.styleTags);
        const normalizedInputTags = styleTags.map(t => t.toLowerCase());
        
        const aMatches = aStyleTags.filter((tag: string) => 
          normalizedInputTags.includes(tag.toLowerCase())
        ).length;
        const bMatches = bStyleTags.filter((tag: string) => 
          normalizedInputTags.includes(tag.toLowerCase())
        ).length;
        
        scoreA += aMatches;
        scoreB += bMatches;
      }

      return scoreB - scoreA; // Higher score first
    });

    // Return up to `count` best matching templates
    if (matchingTemplates.length > 0) {
      return matchingTemplates
        .slice(0, count)
        .map(t => ({
          id: t.id,
          name: t.name,
        }));
    }

    // Fallback: if no specific match, try to find any templates with the use case in tags
    const fallbackTemplates = templates.filter((template) => {
      const tags = typeof template.tags === 'string' 
        ? JSON.parse(template.tags || '[]') 
        : (template.tags || []);
      return tags.some((tag: string) => tag.toLowerCase().includes(useCase.toLowerCase()));
    });

    if (fallbackTemplates.length > 0) {
      return fallbackTemplates
        .slice(0, count)
        .map(t => ({
          id: t.id,
          name: t.name,
        }));
    }

    return [];
  } catch (error) {
    console.error(`[StarterKit] Error finding templates for useCase ${useCase}:`, error);
    return [];
  }
}


