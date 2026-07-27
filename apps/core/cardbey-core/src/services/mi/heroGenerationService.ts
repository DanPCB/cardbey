/**
 * MI Hero Generation Service
 * Generates a hero banner image (and optional headline/subheadline) for a draft store.
 * Uses Pexels -> DALL·E via generateImageUrlForDraftItem.
 */

import { generateImageUrlForDraftItem } from '../menuVisualAgent/menuVisualAgent.js';
import {
  businessNameOverridesHeroCategory,
  resolveHeroSearchSubject,
} from '../../lib/seedLibrary/getSeedImageForCategory.js';
import { resolveHeroImageSearchQuery } from '../draftStore/itemImageQueryResolver.js';

export interface GenerateHeroForDraftArgs {
  storeName?: string | null;
  businessType?: string | null;
  storeType?: string | null;
  /** Optional. Used for vertical-based hero prompt (e.g. services vs food). */
  verticalSlug?: string | null;
  verticalGroup?: string | null;
}

export interface GenerateHeroForDraftResult {
  hero: {
    imageUrl: string | null;
    headline?: string;
    subheadline?: string;
  };
}

const STYLE_MAP: Record<string, 'warm' | 'vibrant' | 'modern' | 'minimal'> = {
  cafe: 'warm',
  'coffee-shop': 'warm',
  coffee_shop: 'warm',
  restaurant: 'warm',
  bakery: 'warm',
  bar: 'warm',
  florist: 'vibrant',
  salon: 'modern',
  spa: 'modern',
  design: 'minimal',
  studio: 'minimal',
  handyman: 'modern',
};

function styleForDraft(businessType?: string | null, storeType?: string | null): 'warm' | 'vibrant' | 'modern' | 'minimal' {
  const raw = [businessType, storeType]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase().trim().replace(/\s+/g, '_'))[0];
  if (!raw) return 'modern';
  return STYLE_MAP[raw] ?? 'modern';
}

export async function generateHeroForDraft(
  args: GenerateHeroForDraftArgs
): Promise<GenerateHeroForDraftResult> {
  const { storeName, businessType, storeType, verticalSlug, verticalGroup } = args;
  const category = businessType || storeType || null;
  const industryHeroQuery = resolveHeroImageSearchQuery({
    storeName,
    businessType,
    storeType,
    verticalSlug,
    verticalGroup,
  });
  const searchSubject = industryHeroQuery ?? resolveHeroSearchSubject(storeName, category);
  const styleName = styleForDraft(businessType, storeType);

  const skipVerticalProfile = businessNameOverridesHeroCategory(storeName, category);
  const profile =
    !skipVerticalProfile && (verticalSlug || verticalGroup)
      ? {
          verticalSlug: verticalSlug || '',
          verticalGroup: verticalGroup || (verticalSlug || '').split('.')[0] || undefined,
        }
      : undefined;
  const heroHint = industryHeroQuery
    ? industryHeroQuery.replace(/\s+hero\s+banner$/i, '').trim()
    : null;
  const options = heroHint
    ? {
        imageQueryHint: heroHint,
        pexelsOrientation: 'landscape' as const,
        profile: skipVerticalProfile
          ? {
              verticalSlug: verticalSlug || '',
              verticalGroup: verticalGroup || undefined,
              keywords: [],
              forbiddenKeywords: [
                'bakery',
                'pastry',
                'donut',
                'doughnut',
                'croissant',
                'cafe',
                'coffee shop',
                'patisserie',
                'boulanger',
              ],
            }
          : profile,
      }
    : profile
      ? { profile, pexelsOrientation: 'landscape' as const }
      : { pexelsOrientation: 'landscape' as const };

  let imageUrl: string | null = null;
  try {
    imageUrl = await generateImageUrlForDraftItem(searchSubject, null, styleName, options);
  } catch (_) {
    imageUrl = null;
  }

  return {
    hero: {
      imageUrl,
    },
  };
}
