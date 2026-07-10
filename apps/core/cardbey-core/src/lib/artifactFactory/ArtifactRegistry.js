/**
 * Artifact Registry — type → adapter mapping (no pipeline duplication).
 */

import { ARTIFACT_TYPES } from './artifactTypes.js';
import {
  PromotionGraphicAdapter,
  PromotionVideoAdapter,
  PosterAdapter,
  SlideshowAdapter,
  SocialPostAdapter,
  LoyaltyProgramAdapter,
  StoreProfileAdapter,
  WebsiteAdapter,
  MenuAdapter,
  CatalogAdapter,
  createPlaceholderAdapter,
} from './adapters/index.js';

/** @type {Map<string, import('./adapters/BaseArtifactAdapter.js').ArtifactAdapter>} */
const registry = new Map();

/**
 * @param {import('./adapters/BaseArtifactAdapter.js').ArtifactAdapter} adapter
 */
export function registerArtifactAdapter(adapter) {
  if (!adapter?.type) throw new Error('adapter.type is required');
  registry.set(adapter.type, adapter);
  return adapter;
}

/**
 * @param {string} type
 */
export function getArtifactAdapter(type) {
  const key = String(type ?? '').trim();
  return key ? registry.get(key) ?? null : null;
}

export function listArtifactAdapters() {
  return [...registry.values()];
}

export function listRegisteredArtifactTypes() {
  return [...registry.keys()];
}

function bootstrapRegistry() {
  registerArtifactAdapter(PromotionVideoAdapter);
  registerArtifactAdapter({ ...PromotionVideoAdapter, type: 'reel' });
  registerArtifactAdapter({ ...PromotionVideoAdapter, type: 'story' });
  registerArtifactAdapter(PromotionGraphicAdapter);
  registerArtifactAdapter(PosterAdapter);
  registerArtifactAdapter(SlideshowAdapter);
  registerArtifactAdapter(SocialPostAdapter);
  registerArtifactAdapter(LoyaltyProgramAdapter);
  registerArtifactAdapter(StoreProfileAdapter);
  registerArtifactAdapter(WebsiteAdapter);
  registerArtifactAdapter({ ...WebsiteAdapter, type: 'landing_page' });
  registerArtifactAdapter(MenuAdapter);
  registerArtifactAdapter(CatalogAdapter);

  const placeholders = {
    store_hero: 'create_promotion_graphic',
    flyer: 'generate_poster',
    brochure: 'generate_poster',
    qr_code: null,
    promotion_offer: 'package_campaign_artifact',
    coupon: 'create_offer',
    invoice: null,
    quote: null,
    business_card: 'generate_poster',
    email_campaign: 'generate_social_posts',
    presentation: 'generate_slideshow',
    digital_signage_playlist: 'generate_slideshow',
  };

  for (const type of ARTIFACT_TYPES) {
    if (registry.has(type)) continue;
    registerArtifactAdapter(createPlaceholderAdapter(type, placeholders[type] ?? null));
  }
}

bootstrapRegistry();
