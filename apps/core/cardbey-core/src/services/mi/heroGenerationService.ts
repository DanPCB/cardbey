/**
 * MI Hero Generation Service
 * Generates a hero banner image (and optional headline/subheadline) for a draft store.
 * Uses Pexels -> DALL·E via generateImageUrlForDraftItem / generateImageForDraftItem.
 */

import {
  generateImageForDraftItem,
  generateImageUrlForDraftItem,
} from '../menuVisualAgent/menuVisualAgent.js';
import {
  businessNameOverridesHeroCategory,
  resolveHeroSearchSubject,
} from '../../lib/seedLibrary/getSeedImageForCategory.js';
import { resolveHeroImageSearchQuery } from '../draftStore/itemImageQueryResolver.js';
import {
  createGroundedCreationDiagnostics,
  isGroundedStoreCreationEnabled,
  logGroundedDiagnostics,
  scoreSemanticMediaMatch,
  shouldAcceptMediaMatch,
} from '../draftStore/groundedStoreCreation.js';

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
    mediaStatus?: 'accepted' | 'needs_media';
    mediaMatchScore?: number;
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
  let mediaMatchScore: number | undefined;
  let mediaStatus: 'accepted' | 'needs_media' | undefined;

  const grounded = isGroundedStoreCreationEnabled();
  try {
    if (grounded) {
      const result = await generateImageForDraftItem(searchSubject, null, styleName, {
        ...options,
        allowNullOnLowConfidence: true,
        businessType: businessType || storeType || null,
        storeName: storeName || null,
        verticalSlug: verticalSlug || null,
        verticalGroup: verticalGroup || null,
      });
      if (result?.url) {
        mediaMatchScore = scoreSemanticMediaMatch({
          itemName: searchSubject,
          businessType: businessType || storeType,
          verticalSlug,
          storeName,
          altText: result.meta?.alt ?? null,
          query: result.query ?? searchSubject,
          providerConfidence: typeof result.confidence === 'number' ? result.confidence : null,
          source: result.source ?? null,
        });
        if (shouldAcceptMediaMatch(mediaMatchScore)) {
          imageUrl = result.url;
          mediaStatus = 'accepted';
        } else {
          mediaStatus = 'needs_media';
          const diagnostics = createGroundedCreationDiagnostics({
            mediaCandidates: 1,
            acceptedMedia: 0,
            rejectedMedia: 1,
            fallbackUsage: { heroMediaMatchGate: true, skippedSeedLibraryHero: true },
            validationFailures: ['hero_media_match_below_threshold'],
          });
          logGroundedDiagnostics(diagnostics);
        }
      } else {
        mediaStatus = 'needs_media';
      }
    } else {
      imageUrl = await generateImageUrlForDraftItem(searchSubject, null, styleName, options);
    }
  } catch (_) {
    imageUrl = null;
    if (grounded) mediaStatus = 'needs_media';
  }

  return {
    hero: {
      imageUrl,
      ...(mediaStatus ? { mediaStatus } : {}),
      ...(typeof mediaMatchScore === 'number' ? { mediaMatchScore } : {}),
    },
  };
}
