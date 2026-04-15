/**
 * Business Profile Generation Service
 * Generates a complete BusinessProfile object from various input modes (OCR, AI description, template)
 * Uses AI helpers to infer business name, type, brand colors, tagline, hero text, and style preferences
 */

import { generatePalette, generateText } from './aiService.js';

/**
 * Input mode for business profile generation
 */
export type BusinessProfileInputMode = 'ocr' | 'ai_description' | 'template';

/**
 * Input parameters for generating a business profile
 */
export interface BusinessProfileInput {
  mode: BusinessProfileInputMode;
  
  // For 'ocr', provide raw menu / text
  ocrRawText?: string;
  
  // For 'ai_description', provide a short free-form description
  descriptionText?: string;
  
  // For 'template', provide a key like "cafe", "bakery", "salon"
  templateKey?: string;
  
  // Optional user-provided overrides
  explicitName?: string;
  explicitType?: string;
  regionCode?: string; // e.g. 'AU', 'VN'
  /** When set (e.g. from classify-business), used as tagline and no AI tagline is generated */
  explicitTagline?: string;
}

/**
 * Generated business profile with all brand fields
 */
export interface BusinessProfile {
  name: string;
  type: string; // e.g. 'coffee-shop', 'bakery', 'salon', 'general'
  primaryColor?: string;
  secondaryColor?: string;
  tagline?: string;
  heroText?: string;
  stylePreferences?: {
    style?: 'modern' | 'classic' | 'playful' | 'minimal' | 'bold';
    mood?: 'warm' | 'cool' | 'bold' | 'calm' | 'energetic';
    [key: string]: any;
  };
}

/**
 * Default color palette fallback
 */
const DEFAULT_COLORS = {
  primary: '#222222',
  secondary: '#FF6600',
};

/**
 * Map template keys to business types
 */
const TEMPLATE_KEY_TO_TYPE: Record<string, string> = {
  'cafe': 'coffee-shop',
  'coffee': 'coffee-shop',
  'cafe-menu': 'coffee-shop',
  'bakery': 'bakery',
  'salon': 'salon',
  'beauty': 'salon',
  'nail_salon': 'nail_salon',
  'nails': 'nail_salon',
  'restaurant': 'restaurant',
  'food_seafood': 'restaurant',
  'food_restaurant_generic': 'restaurant',
  'food_bakery': 'bakery',
  'florist': 'florist',
  'flower': 'florist',
  'retail': 'retail',
  'fashion': 'retail',
  'fashion_boutique': 'retail',
  'fashion_kids': 'children-clothing',
  'clothing': 'retail',
  'nail_salon': 'nail_salon',
  'beauty_nails': 'nail_salon',
  'gym': 'fitness',
  'fitness': 'fitness',
  'spa': 'spa',
  'generic_store': 'general',
  'services_generic': 'general',
  'game_centre': 'game-centre',
  'default': 'general',
};

/**
 * Infer business type from name or description text (e.g. "Union Road Cafe" -> coffee-shop)
 */
function inferBusinessTypeFromText(text: string): string {
  if (!text) return 'general';
  
  const lowerText = text.toLowerCase();
  
  // Check for common business type keywords (name or description)
  if (/\b(cafe|coffee|espresso|latte|barista)\b/.test(lowerText)) {
    return 'coffee-shop';
  }
  if (/\b(bakery|bread|pastry|cake|bakehouse)\b/.test(lowerText)) return 'bakery';
  if (/\b(salon|hair|beauty|nail)\b/.test(lowerText)) return 'salon';
  if (/\b(restaurant|dining|bistro|grill|kitchen|eatery)\b/.test(lowerText)) return 'restaurant';
  if (/\b(florist|flower|bouquet|bloom)\b/.test(lowerText)) return 'florist';
  if (/\b(gym|fitness|workout)\b/.test(lowerText)) return 'fitness';
  if (/\b(spa|massage|wellness)\b/.test(lowerText)) return 'spa';
  if (/\b(retail|shop|store)\b/.test(lowerText)) return 'retail';
  return 'general';
}

/**
 * Infer business type from template key (exported for use by draft store template path)
 */
export function inferBusinessTypeFromTemplateKey(templateKey: string): string {
  if (!templateKey) return 'general';
  
  const normalizedKey = templateKey.toLowerCase().trim();
  return TEMPLATE_KEY_TO_TYPE[normalizedKey] || 'general';
}

/**
 * Build a deterministic business profile from template key + overrides. No LLM calls.
 * Used when mode is "template" (AI Off) so template mode makes zero LLM calls.
 */
export function getTemplateProfile(
  templateKey: string,
  overrides?: { explicitName?: string; explicitType?: string }
): BusinessProfile {
  const businessType = overrides?.explicitType?.trim()
    ? overrides.explicitType.trim()
    : inferBusinessTypeFromTemplateKey(templateKey);
  const displayName = businessType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const businessName = (overrides?.explicitName && overrides.explicitName.trim().length > 0)
    ? overrides.explicitName.trim()
    : displayName;
  const stylePreferences = getStylePreferencesForType(businessType);
  return {
    name: businessName || 'New Business',
    type: businessType || 'general',
    primaryColor: DEFAULT_COLORS.primary,
    secondaryColor: DEFAULT_COLORS.secondary,
    tagline: undefined,
    heroText: undefined,
    stylePreferences,
  };
}

/**
 * Get style preferences based on business type
 */
function getStylePreferencesForType(businessType: string): BusinessProfile['stylePreferences'] {
  const typeToStyle: Record<string, BusinessProfile['stylePreferences']> = {
    'coffee-shop': { style: 'modern', mood: 'warm' },
    'bakery': { style: 'playful', mood: 'warm' },
    'salon': { style: 'modern', mood: 'cool' },
    'nail_salon': { style: 'modern', mood: 'cool' },
    'restaurant': { style: 'classic', mood: 'warm' },
    'fitness': { style: 'bold', mood: 'energetic' },
    'spa': { style: 'minimal', mood: 'calm' },
    'retail': { style: 'modern', mood: 'bold' },
    'fashion': { style: 'modern', mood: 'bold' },
    'game-centre': { style: 'playful', mood: 'energetic' },
    'general': { style: 'modern', mood: 'warm' },
  };
  
  return typeToStyle[businessType] || { style: 'modern', mood: 'warm' };
}

/**
 * Generate business name from description using AI
 */
async function generateBusinessName(description: string, businessType: string): Promise<string> {
  try {
    const result = await generateText({
      prompt: `Given this business description: "${description.substring(0, 300)}"
Business type: ${businessType}

Suggest a short, brandable business name (2-4 words max). The name should be memorable and suitable for a ${businessType}.
Return only the business name, no explanations.`,
      language: 'en',
      tone: 'professional',
      context: { section: 'generic' },
    });
    
    if (result?.text) {
      const name = result.text.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
      if (name.length > 0 && name.length <= 50) {
        return name;
      }
    }
  } catch (error: any) {
    // AI service may not be available or may throw
    if (error?.message?.includes('not available')) {
      console.warn('[BusinessProfile] AI service not available, using fallback name');
    } else {
      console.warn('[BusinessProfile] Failed to generate business name:', error);
    }
  }
  
  // Fallback: generate a simple name from type
  return `${businessType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`;
}

/**
 * Generate brand colors using AI palette generation
 */
async function generateBrandColors(
  description: string,
  businessType: string,
  stylePreferences?: BusinessProfile['stylePreferences']
): Promise<{ primaryColor: string; secondaryColor: string }> {
  try {
    const theme = stylePreferences?.style || 'modern';
    const mood = stylePreferences?.mood || 'warm';
    
    const palette = await generatePalette(theme, mood, {
      businessType,
      description: description.substring(0, 200),
    });
    
    if (palette && Array.isArray(palette) && palette.length >= 2) {
      return {
        primaryColor: palette[0],
        secondaryColor: palette[1],
      };
    }
  } catch (error) {
    console.warn('[BusinessProfile] Failed to generate brand colors:', error);
  }
  
  // Fallback to defaults
  return {
    primaryColor: DEFAULT_COLORS.primary,
    secondaryColor: DEFAULT_COLORS.secondary,
  };
}

/**
 * Generate tagline using AI
 */
async function generateTagline(description: string, businessName: string, businessType: string): Promise<string | undefined> {
  try {
    const result = await generateText({
      prompt: `Create a catchy tagline for "${businessName}" (a ${businessType}).
Business description: ${description.substring(0, 200)}

The tagline should be:
- Short and memorable (5-10 words max)
- Capture the essence of the business
- Suitable for marketing materials

Return only the tagline, no quotes or explanations.`,
      language: 'en',
      tone: 'friendly',
      context: { section: 'headline' },
    });
    
    if (result?.text) {
      const tagline = result.text.trim().replace(/^["']|["']$/g, '');
      if (tagline.length > 0 && tagline.length <= 100) {
        return tagline;
      }
    }
  } catch (error: any) {
    // AI service may not be available - silently return undefined
    if (!error?.message?.includes('not available')) {
      console.warn('[BusinessProfile] Failed to generate tagline:', error);
    }
  }
  
  return undefined;
}

/**
 * Generate hero text using AI
 */
async function generateHeroText(description: string, businessName: string, businessType: string): Promise<string | undefined> {
  try {
    const result = await generateText({
      prompt: `Write a compelling hero text (1-2 sentences) for "${businessName}" (a ${businessType}).
Business description: ${description.substring(0, 200)}

The hero text should:
- Be engaging and welcoming (20-40 words)
- Describe what makes this business special
- Be suitable for homepage banners and marketing materials

Return only the hero text, no quotes or explanations.`,
      language: 'en',
      tone: 'friendly',
      context: { section: 'body' },
    });
    
    if (result?.text) {
      const heroText = result.text.trim().replace(/^["']|["']$/g, '');
      if (heroText.length > 0 && heroText.length <= 200) {
        return heroText;
      }
    }
  } catch (error: any) {
    // AI service may not be available - silently return undefined
    if (!error?.message?.includes('not available')) {
      console.warn('[BusinessProfile] Failed to generate hero text:', error);
    }
  }
  
  return undefined;
}

/**
 * Normalize base description from input mode
 */
function normalizeBaseDescription(input: BusinessProfileInput): string {
  const { mode, ocrRawText, descriptionText, templateKey } = input;
  
  if (mode === 'ocr' && ocrRawText) {
    // For OCR, use the raw text (could be menu items)
    // Extract a simple description by taking first few lines or summarizing
    const lines = ocrRawText.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      // Take first 3-5 lines as context
      return lines.slice(0, 5).join(' ').substring(0, 300);
    }
    return ocrRawText.substring(0, 300);
  }
  
  if (mode === 'ai_description' && descriptionText) {
    return descriptionText.substring(0, 500);
  }
  
  if (mode === 'template' && templateKey) {
    // Generate a simple description from template key
    const type = inferBusinessTypeFromTemplateKey(templateKey);
    return `A ${type.replace('-', ' ')} business`;
  }
  
  return 'A new business';
}

/**
 * Main function: Generate a complete business profile from input
 */
export async function generateBusinessProfile(input: BusinessProfileInput): Promise<BusinessProfile> {
  const { mode, explicitName, explicitType, templateKey } = input;
  
  // Step 1: Normalize base description
  const baseDescription = normalizeBaseDescription(input);
  
  // Step 2: Determine business type (use name as well so "Union Road Cafe" -> coffee-shop)
  let businessType: string;
  if (explicitType) {
    businessType = explicitType;
  } else if (mode === 'template' && templateKey) {
    businessType = inferBusinessTypeFromTemplateKey(templateKey);
  } else {
    const textForType = [baseDescription, explicitName].filter(Boolean).join(' ');
    businessType = inferBusinessTypeFromText(textForType);
  }
  
  // Ensure type is never empty
  if (!businessType || businessType.trim().length === 0) {
    businessType = 'general';
  }
  
  // Step 3: Determine business name
  let businessName: string;
  if (explicitName && explicitName.trim().length > 0) {
    businessName = explicitName.trim();
  } else {
    try {
      businessName = await generateBusinessName(baseDescription, businessType);
    } catch (error) {
      console.warn('[BusinessProfile] Failed to generate name, using fallback:', error);
      businessName = businessType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  
  // Ensure name is never empty
  if (!businessName || businessName.trim().length === 0) {
    businessName = 'New Business';
  }
  
  // Step 4: Get style preferences
  const stylePreferences = getStylePreferencesForType(businessType);
  
  // Step 5: Generate brand colors (in parallel with text generation for efficiency)
  const colorsPromise = generateBrandColors(baseDescription, businessType, stylePreferences);
  
  // Step 6: Generate tagline and hero text (explicitTagline from classify-business skips AI tagline)
  const explicitTagline = input.explicitTagline?.trim();
  const taglinePromise = explicitTagline ? Promise.resolve(explicitTagline) : generateTagline(baseDescription, businessName, businessType);
  const heroTextPromise = generateHeroText(baseDescription, businessName, businessType);
  
  const [colors, tagline, heroText] = await Promise.all([
    colorsPromise,
    taglinePromise,
    heroTextPromise,
  ]);
  
  // Step 7: Build and return the profile
  const profile: BusinessProfile = {
    name: businessName,
    type: businessType,
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
    tagline: (explicitTagline || tagline) || undefined,
    heroText: heroText || undefined,
    stylePreferences,
  };
  
  console.log(`[BusinessProfile] Generated profile for "${businessName}" (${businessType})`);
  
  return profile;
}

