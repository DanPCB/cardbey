/**
 * MI Orchestrator Service
 * Provides high-level MI analysis and suggestions for playlists and other entities
 */

import { PrismaClient } from '@prisma/client';
import * as miService from './miService.js';

// Default prisma instance for production use
let defaultPrisma: PrismaClient | null = null;

function getDefaultPrisma(): PrismaClient {
  if (!defaultPrisma) {
    defaultPrisma = new PrismaClient();
  }
  return defaultPrisma;
}

export interface PlaylistSuggestion {
  type: 'info' | 'warning' | 'recommendation';
  code: string;
  message: string;
  itemId?: string;
}

export interface GetSignagePlaylistSuggestionsParams {
  playlistId: string;
  tenantId: string;
  storeId?: string | null;
  prisma?: PrismaClient; // Optional: allow tests to pass their prisma instance
}

/**
 * Get MI-based suggestions for a Signage playlist
 */
export async function getSignagePlaylistSuggestions({
  playlistId,
  tenantId,
  storeId,
  prisma: providedPrisma,
}: GetSignagePlaylistSuggestionsParams): Promise<PlaylistSuggestion[]> {
  const suggestions: PlaylistSuggestion[] = [];
  const prisma = providedPrisma || getDefaultPrisma();

  try {
    // Load playlist with items + assets, filtered by tenant/store for security
    // Note: Signage playlists use the unified Playlist model with type='SIGNAGE'
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: playlistId,
        type: 'SIGNAGE',
        tenantId: tenantId || undefined, // Filter by tenant for security
        ...(storeId ? { storeId } : {}), // Optional store filter
      },
      include: {
        items: {
          orderBy: { orderIndex: 'asc' },
          include: {
            // For Signage playlists, items link to SignageAsset via assetId
            // We need to manually join or fetch assets separately
          },
        },
      },
    });

    if (!playlist) {
      return [
        {
          type: 'warning',
          code: 'playlist_not_found',
          message: 'Playlist not found for MI suggestions. It may not exist or you may not have access to it.',
        },
      ];
    }

    const items = playlist.items ?? [];

    // Debug logging in test env
    if (process.env.NODE_ENV === 'test') {
      console.log(`[MIOrchestrator] Playlist ${playlistId}: ${items.length} items`);
    }

    // Basic heuristic 1: Very short durations for attractor items
    for (const item of items) {
      let miEntity = null;

      try {
        miEntity = await miService.getEntityByLink({
          screenItemId: item.id,
        });
      } catch (err) {
        // Ignore MI errors here
        console.warn(`[MIOrchestrator] Failed to get MIEntity for item ${item.id}:`, err);
      }

      // Get duration from item, or fall back to playlist default, or use 8s as final fallback
      // Note: Playlist model doesn't have defaultDurationS field, so we use 8s as default
      const durationS = item.durationS ?? 8;

      // Debug logging in test env
      if (process.env.NODE_ENV === 'test') {
        console.log(`[MIOrchestrator] Item ${item.id}: durationS=${durationS}, miEntity=${miEntity ? 'found' : 'not found'}`);
        if (miEntity) {
          const brain = (miEntity.miBrain as any) || {};
          console.log(`[MIOrchestrator] Item ${item.id}: primaryIntent="${brain?.primaryIntent || ''}", durationS=${durationS}`);
        }
      }

      // Check if item has attractor intent but short duration
      if (miEntity) {
        const brain = (miEntity.miBrain as any) || {};
        const primaryIntent = brain?.primaryIntent || '';
        
        
        if (primaryIntent === 'attract_attention_to_promo' && durationS < 5) {
          suggestions.push({
            type: 'recommendation',
            code: 'increase_duration_for_attractor',
            message: `Item #${item.orderIndex + 1} is an attractor promo but displays for only ${durationS}s. Consider increasing to at least 6–8 seconds.`,
            itemId: item.id,
          });
        }

        // Basic heuristic 2: Missing role on MI
        if (!brain?.role) {
          suggestions.push({
            type: 'warning',
            code: 'missing_role',
            message: `Item #${item.orderIndex + 1} has MIEntity but no role set. Assign a role to improve MI behavior.`,
            itemId: item.id,
          });
        }
      }

      // Basic heuristic 3: Missing MIEntity entirely
      if (!miEntity) {
        suggestions.push({
          type: 'info',
          code: 'missing_mi_entity',
          message: `Item #${item.orderIndex + 1} has no MIEntity. Consider running backfill or creating MIEntity for better suggestions.`,
          itemId: item.id,
        });
      }
    }

    // Heuristic 4: Only one item in playlist
    if (items.length === 1) {
      suggestions.push({
        type: 'info',
        code: 'single_item_playlist',
        message:
          'This playlist contains only one item. Consider adding at least one more variation to avoid fatigue.',
      });
    }

    // Heuristic 5: Very long playlist (potential fatigue)
    if (items.length > 20) {
      suggestions.push({
        type: 'info',
        code: 'long_playlist',
        message: `This playlist has ${items.length} items. Consider splitting into multiple playlists or reducing to avoid viewer fatigue.`,
      });
    }

    // If no suggestions, return a friendly info message
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'info',
        code: 'no_issues_detected',
        message: 'No obvious MI issues detected for this playlist.',
      });
    }

    return suggestions;
  } catch (error) {
    console.error('[MIOrchestrator] Error getting playlist suggestions:', error);
    return [
      {
        type: 'warning',
        code: 'error',
        message: `Failed to analyze playlist: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
    ];
  }
}

export interface GetTemplateSuggestionsParams {
  tenantId?: string | null;
  storeId?: string | null;
  channel?: string | null;
  role?: string | null;
  primaryIntent?: string | null;
  orientation?: string | null;
  limit?: number;
  query?: string; // Search query for text-based filtering and AI proposals
  prisma?: PrismaClient; // Optional: allow tests to pass their prisma instance
}

export interface TemplateSuggestion {
  id: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  role: string | null;
  primaryIntent: string | null;
  channels: string[];
  orientation: string | null;
  minDurationS: number | null;
  maxDurationS: number | null;
  tags: string[];
  miEntity: any | null;
  score: number;
}

/**
 * Get template suggestions for a given context
 * Scores templates based on relevance to the provided filters
 */
export async function getTemplateSuggestionsForContext(
  params: GetTemplateSuggestionsParams
): Promise<{ 
  ok: true; 
  templates: TemplateSuggestion[]; 
  aiProposals?: any[];
  debug: { totalCandidates: number } 
} | { ok: false; error: string }> {
  try {
    const {
      tenantId,
      storeId,
      channel,
      role,
      primaryIntent,
      orientation,
      limit = 20,
      query,
      prisma: providedPrisma,
    } = params;

    const prisma = providedPrisma || getDefaultPrisma();

    // Defensive guard: Check if CreativeTemplate model exists on Prisma client
    // @ts-ignore - runtime safety guard
    if (!prisma.creativeTemplate || typeof prisma.creativeTemplate.findMany !== 'function') {
      console.error(
        '[MIOrchestrator] Template model prisma.creativeTemplate is not available on this Prisma client. Returning empty suggestions.'
      );
      return {
        ok: true,
        templates: [],
        debug: { totalCandidates: 0 },
      };
    }

    // 1) Fetch candidate templates: global + tenant + store-specific
    const where: any = {
      isActive: true,
      OR: [
        { tenantId: null }, // Global templates
        ...(tenantId ? [{ tenantId }] : []), // Tenant-specific
        ...(tenantId && storeId ? [{ tenantId, storeId }] : []), // Store-specific
      ],
    };

    const candidates = await prisma.creativeTemplate.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 2) Score each candidate (with optional query-based boosting)
    const scoredTemplates: Array<{ template: any; score: number }> = [];

    for (const template of candidates) {
      let score = 0;

      // Parse JSON fields
      const channels = typeof template.channels === 'string'
        ? JSON.parse(template.channels)
        : (Array.isArray(template.channels) ? template.channels : []);
      const tags = typeof template.tags === 'string'
        ? JSON.parse(template.tags)
        : (Array.isArray(template.tags) ? template.tags : []);

      // Query-based text matching (boost score if query matches name/description/tags)
      if (query) {
        const queryLower = query.toLowerCase();
        const nameMatch = template.name?.toLowerCase().includes(queryLower);
        const descMatch = template.description?.toLowerCase().includes(queryLower);
        const tagMatch = tags.some((tag: string) => tag.toLowerCase().includes(queryLower));
        
        if (nameMatch) score += 30; // Strong match on name
        if (descMatch) score += 15; // Match on description
        if (tagMatch) score += 10; // Match on tags
      }

      // Scoring weights
      if (role && template.role === role) {
        score += 40; // Exact role match
      }
      if (primaryIntent && template.primaryIntent === primaryIntent) {
        score += 30; // Exact intent match
      }
      if (orientation && template.orientation === orientation) {
        score += 15; // Orientation match
      }
      if (channel && channels.includes(channel)) {
        score += 10; // Channel match
      }
      if (tenantId && template.tenantId === tenantId) {
        score += 10; // Tenant match (prefer tenant-specific over global)
      }
      if (storeId && template.storeId === storeId) {
        score += 5; // Store match (prefer store-specific)
      }

      // Give base score to templates with default/generic values when filters are provided
      // This ensures templates with default metadata still show up even with filters
      const hasDefaultRole = template.role === 'generic' || !template.role;
      const hasDefaultIntent = template.primaryIntent === 'general_design' || !template.primaryIntent;
      const hasDefaultOrientation = template.orientation === 'any' || !template.orientation;
      const hasDefaultChannels = channels.length === 0 || 
        (channels.includes('cnet_screen') && channels.includes('storefront') && channels.includes('social'));

      // If template has default values and filters are provided, give a base score
      if ((role || primaryIntent || orientation || channel) && 
          (hasDefaultRole || hasDefaultIntent || hasDefaultOrientation || hasDefaultChannels)) {
        // Base score for generic/default templates when filters are provided
        // This ensures they appear in results even if they don't match exactly
        score = Math.max(score, 1);
      }

      // Only include templates with positive score or if no filters provided
      if (score > 0 || (!role && !primaryIntent && !orientation && !channel)) {
        scoredTemplates.push({ template, score });
      }
    }

    // 3) Sort by score desc, slice to limit
    scoredTemplates.sort((a, b) => b.score - a.score);
    const topTemplates = scoredTemplates.slice(0, limit);

    // 4) Attach MIEntity for each template
    const templatesWithMI = await Promise.all(
      topTemplates.map(async ({ template, score }) => {
        let miEntity = null;
        try {
          miEntity = await miService.getEntityByLink({ templateId: template.id });
        } catch (err) {
          // Ignore errors
          console.warn(`[MIOrchestrator] Failed to get MIEntity for template ${template.id}:`, err);
        }

        // Parse JSON fields
        const channels = typeof template.channels === 'string'
          ? JSON.parse(template.channels)
          : (Array.isArray(template.channels) ? template.channels : []);
        const tags = typeof template.tags === 'string'
          ? JSON.parse(template.tags)
          : (Array.isArray(template.tags) ? template.tags : []);

        return {
          id: template.id,
          name: template.name,
          description: template.description,
          thumbnailUrl: template.thumbnailUrl,
          role: template.role,
          primaryIntent: template.primaryIntent,
          channels,
          orientation: template.orientation,
          minDurationS: template.minDurationS,
          maxDurationS: template.maxDurationS,
          tags,
          miEntity,
          score,
        };
      })
    );

    // 5) Generate AI proposals if query exists and results are empty/low-confidence
    let aiProposals: any[] = [];
    const shouldGenerateProposals = query && (
      templatesWithMI.length === 0 || 
      templatesWithMI[0].score < 20 // Low confidence threshold
    );

    if (shouldGenerateProposals) {
      try {
        const { generateTemplateProposalsFromQuery } = await import('./templateAIProposalService.js');
        const { getBusinessContext } = await import('./templateContextHelpers.js');
        
        // Get business context for proposals
        const businessContext = storeId 
          ? await getBusinessContext(storeId)
          : { business: null };

        aiProposals = await generateTemplateProposalsFromQuery({
          query,
          tenantId: tenantId || null,
          storeId: storeId || null,
          channel: channel || null,
          role: role || null,
          primaryIntent: primaryIntent || null,
          orientation: orientation || null,
          businessContext,
        });

        console.log(`[MIOrchestrator] Generated ${aiProposals.length} AI proposals for query: "${query}"`);
      } catch (proposalError) {
        console.warn('[MIOrchestrator] Failed to generate AI proposals:', proposalError);
        // Don't fail the request if proposals fail
      }
    }

    return {
      ok: true,
      templates: templatesWithMI,
      aiProposals: aiProposals.length > 0 ? aiProposals : undefined,
      debug: {
        totalCandidates: candidates.length,
      },
    };
  } catch (error) {
    console.error('[MIOrchestrator] Error getting template suggestions:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface InstantiateTemplateParams {
  templateContentId: string;
  tenantId: string;
  storeId?: string | null;
  channel?: string | null;
  orientation?: 'vertical' | 'horizontal' | null;
  userId?: string | null;
  autoFillText?: boolean; // If true, use AI to fill text/richtext slots that don't have values
  prisma?: PrismaClient; // Optional: allow tests to pass their prisma instance
}

/**
 * Instantiate a CreativeTemplate into a new Content record
 * Clones the template's base Content and creates a new Content with proper tenant/store context
 */
export async function instantiateCreativeTemplateForContext(
  params: InstantiateTemplateParams
): Promise<{ 
  content: any & { miEntity?: any };
  templateId?: string;
  slotValues?: Record<string, any>;
  businessContextSummary?: { id: string; name: string };
}> {
  try {
    const {
      templateContentId,
      tenantId,
      storeId,
      channel,
      orientation,
      userId,
      autoFillText = false, // Default to false for backward compatibility
      prisma: providedPrisma,
    } = params;

    const prisma = providedPrisma || getDefaultPrisma();

    // Step 1: Load the CreativeTemplate
    // @ts-ignore - runtime safety guard
    if (!prisma.creativeTemplate) {
      throw new Error('CreativeTemplate model not available. Please run database migration.');
    }

    const template = await prisma.creativeTemplate.findUnique({
      where: { id: templateContentId },
    });

    if (!template) {
      throw new Error(`Template not found: ${templateContentId}`);
    }

    // Step 2: Load the base Content that the template references
    if (!template.baseContentId) {
      throw new Error(`Template ${templateContentId} has no baseContentId. Cannot instantiate.`);
    }

    const baseContent = await prisma.content.findUnique({
      where: { id: template.baseContentId },
    });

    if (!baseContent) {
      throw new Error(`Base content not found: ${template.baseContentId}`);
    }

    // Step 3: Get template's MIEntity to reuse role/primaryIntent
    let templateMIEntity = null;
    try {
      templateMIEntity = await miService.getEntityByLink({ templateId: template.id });
    } catch (err) {
      console.warn(`[MIOrchestrator] Failed to get template MIEntity:`, err);
    }

    // Step 4: Parse template fields and build business context
    let slots: any[] = [];
    let slotValues: Record<string, any> = {};
    let businessContextSummary: { id: string; name: string } | null = null;

    // @ts-ignore - fields may not be in Prisma types until migration is run
    const templateFields = (template as any).fields;
    if (templateFields) {
      try {
        const fieldsData = typeof templateFields === 'string' 
          ? JSON.parse(templateFields) 
          : templateFields;
        
        if (fieldsData && typeof fieldsData === 'object' && Array.isArray(fieldsData.slots)) {
          slots = fieldsData.slots;
        } else if (Array.isArray(fieldsData)) {
          // Support both { slots: [...] } and direct array
          slots = fieldsData;
        }

        // Get business context for slot resolution
        if (slots.length > 0 && storeId) {
          const { getBusinessContext, buildSlotValues } = await import('./templateContextHelpers.js');
          const businessContext = await getBusinessContext(storeId);
          
          if (businessContext.business) {
            businessContextSummary = {
              id: businessContext.business.id,
              name: businessContext.business.name,
            };
            
            // Step 4.1: Resolve slot values from sourceKey and defaultValue
            slotValues = buildSlotValues(slots, businessContext);
            
            console.log(`[MIOrchestrator] Resolved ${Object.keys(slotValues).length} slot values from business context`);
            
            // Step 4.2: AI text filling for empty text/richtext slots (if enabled)
            if (autoFillText) {
              // @ts-ignore - aiContext may not be in Prisma types until migration is run
              const templateAIContext = (template as any).aiContext;
              let aiContext: any = null;
              
              if (templateAIContext) {
                try {
                  aiContext = typeof templateAIContext === 'string' 
                    ? JSON.parse(templateAIContext) 
                    : templateAIContext;
                } catch (e) {
                  console.warn(`[MIOrchestrator] Failed to parse aiContext:`, e);
                }
              }
              
              // For each slot that doesn't have a value yet
              for (const slot of slots) {
                if (!slot || typeof slot !== 'object' || !slot.id) continue;
                
                // Only fill text/richtext slots that are still empty
                if ((slot.type === 'text' || slot.type === 'richtext') && !slotValues[slot.id]) {
                  try {
                    const { generateTextForSlot } = await import('./templateAITextService.js');
                    const generated = await generateTextForSlot({
                      slot,
                      aiContext,
                      businessContext,
                      language: aiContext?.language || 'en',
                    });
                    
                    if (generated) {
                      slotValues[slot.id] = generated;
                      console.log(`[MIOrchestrator] AI-filled slot "${slot.id}" with: "${generated.substring(0, 50)}..."`);
                    }
                  } catch (aiError) {
                    // AI failures should not block instantiation
                    console.warn(`[MIOrchestrator] AI text generation failed for slot "${slot.id}":`, aiError);
                  }
                }
              }
              
              console.log(`[MIOrchestrator] AI text filling complete. Total slot values: ${Object.keys(slotValues).length}`);
            }
          }
        }
      } catch (error) {
        console.warn(`[MIOrchestrator] Failed to parse template fields or build context:`, error);
      }
    }

    // Step 5: Create new Content by cloning the base Content
    // Apply slot values to content if needed (store in meta for frontend use)
    const newContentName = `Template – ${template.name}`;
    
    // Prepare content settings with slot values in meta
    const contentSettings: any = baseContent.settings || {};
    if (Object.keys(slotValues).length > 0) {
      contentSettings.meta = {
        ...(contentSettings.meta || {}),
        templateSlots: slotValues,
        templateId: template.id,
      };
    }
    
    const newContent = await prisma.content.create({
      data: {
        name: newContentName,
        userId: userId || baseContent.userId, // Use provided userId or fallback to template's userId
        elements: baseContent.elements || [],
        settings: contentSettings,
        renderSlide: baseContent.renderSlide,
        thumbnailUrl: template.thumbnailUrl || baseContent.thumbnailUrl,
        version: 1,
      },
    });

    console.log(`[MIOrchestrator] Instantiated template ${templateContentId} into content ${newContent.id}`);

    // Step 5.5: Register MIEntity for the new Content
    let miEntity = null;
    try {
      const { buildCreativeAssetMIBrain } = await import('../mi/miCreativeHelpers.js');
      const { registerOrUpdateEntity } = await import('./miService.js');

      // Build MI Brain, reusing template's role/primaryIntent if available
      const templateBrain = templateMIEntity?.miBrain as any;
      const role = templateBrain?.role || template.role || 'creative_generic';
      const primaryIntent = templateBrain?.primaryIntent || template.primaryIntent || 'generic_marketing_asset';
      
      // Build channels list - include template channels + provided channel
      const templateChannels = typeof template.channels === 'string'
        ? JSON.parse(template.channels)
        : (Array.isArray(template.channels) ? template.channels : []);
      
      const channels = [...new Set([
        ...templateChannels,
        ...(channel ? [channel] : []),
        'creative_engine',
      ])];

      // Build MI Brain with template context
      const miBrain = {
        role,
        primaryIntent,
        secondaryIntents: templateBrain?.secondaryIntents || [],
        context: {
          tenantId: tenantId || undefined,
          storeId: storeId || undefined,
          channels,
          environmentHints: {
            isPhysical: false,
            isOnDeviceEngine: false,
          },
        },
        capabilities: {
          personalisation: { enabled: false },
          localisation: { autoTranslate: false, fallbackLocale: 'en-AU' },
          channelAdaptation: { enabled: true },
          dynamicLayout: { enabled: false },
          dataBindings: { enabled: false },
        },
        behaviorRules: {},
        ctaPlan: null,
        analyticsPlan: {
          kpis: ['content_views', 'content_exports'],
          attributionSource: 'template_instantiation',
        },
        lifecycle: {
          status: 'active',
        },
      };

      // Infer media type from content elements
      const hasVideo = Array.isArray(newContent.elements) && newContent.elements.some((el: any) => 
        el?.type === 'video' || el?.kind === 'video'
      );
      const mediaType = hasVideo ? 'video' : 'image';

      // Register MIEntity
      miEntity = await registerOrUpdateEntity({
        productId: newContent.id,
        productType: 'creative_asset',
        mediaType,
        fileUrl: newContent.thumbnailUrl || '',
        previewUrl: newContent.thumbnailUrl || '',
        dimensions: undefined,
        orientation: orientation || template.orientation || undefined,
        durationSec: template.maxDurationS || undefined,
        createdByUserId: userId || 'system',
        createdByEngine: 'creative_engine_v3',
        sourceProjectId: template.id, // Link back to template
        tenantId,
        storeId: storeId || null,
        campaignId: null,
        miBrain,
        status: 'active',
        links: {},
      });

      console.log(`[MIOrchestrator] Registered MIEntity for instantiated content ${newContent.id}`);
    } catch (miError) {
      // Non-critical: log but don't fail the request
      console.warn(`[MIOrchestrator] Failed to register MIEntity for content ${newContent.id}:`, miError);
    }

    // Step 6: Return the new Content with MIEntity attached and context metadata
    return {
      content: {
        ...newContent,
        miEntity: miEntity || null,
      },
      templateId: template.id,
      slotValues: Object.keys(slotValues).length > 0 ? slotValues : undefined,
      businessContextSummary: businessContextSummary || undefined,
    };
  } catch (error) {
    console.error('[MIOrchestrator] Failed to instantiate template:', error);
    throw error;
  }
}

