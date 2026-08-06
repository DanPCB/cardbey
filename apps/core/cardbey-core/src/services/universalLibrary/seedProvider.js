/**
 * Seed provider — curated Cardbey internal catalog (no external APIs).
 */

import {
  ASSET_PROVIDER,
  ASSET_STATUS,
  ASSET_TYPE,
  RIGHTS_STATUS,
} from './universalAssetTypes.js';
import { createUniversalAsset } from './universalAssetService.js';

/** @type {Array<object>} */
export const SEED_CATALOG = Object.freeze([
  {
    key: 'seed-hero-retail',
    title: 'Retail Storefront Hero',
    description: 'Curated hero imagery for retail storefront templates.',
    type: ASSET_TYPE.IMAGE,
    provider: ASSET_PROVIDER.SEED,
    categories: ['retail', 'creative'],
    tags: ['hero', 'storefront'],
    license: 'cardbey-internal',
    qualityScore: 72,
    thumbnail: '/assets/template-preview/retail-store-website.jpg',
  },
  {
    key: 'seed-hero-restaurant',
    title: 'Restaurant & Cafe Hero',
    description: 'Warm dining atmosphere hero for food businesses.',
    type: ASSET_TYPE.IMAGE,
    provider: ASSET_PROVIDER.SEED,
    categories: ['food-beverage'],
    tags: ['hero', 'restaurant'],
    license: 'cardbey-internal',
    qualityScore: 75,
    thumbnail: '/assets/template-preview/restaurant-cafe-website.jpg',
  },
  {
    key: 'seed-template-minimal',
    title: 'Minimal Seller Storefront Template',
    description: 'Clean minimal storefront layout starter.',
    type: ASSET_TYPE.TEMPLATE,
    provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
    categories: ['retail', 'creative'],
    tags: ['template', 'minimal'],
    license: 'cardbey-internal',
    qualityScore: 80,
    thumbnail: '/assets/template-preview/minimal-seller-storefront.jpg',
  },
  {
    key: 'seed-audio-ambient',
    title: 'Ambient Store Background',
    description: 'Soft ambient loop for in-store signage playlists.',
    type: ASSET_TYPE.AUDIO,
    provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
    categories: ['creative'],
    tags: ['audio', 'ambient', 'signage'],
    license: 'cardbey-internal',
    qualityScore: 65,
  },
  {
    key: 'seed-article-launch',
    title: 'Launch Your Digital Store',
    description: 'Getting started guide for new Cardbey merchants.',
    type: ASSET_TYPE.ARTICLE,
    provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
    categories: ['business', 'education'],
    tags: ['guide', 'onboarding'],
    license: 'cardbey-internal',
    qualityScore: 70,
  },
]);

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function seedCuratedCatalog(prisma, options = {}) {
  const ownerId = options.ownerId ? String(options.ownerId) : 'cardbey_platform';
  const skipExisting = options.skipExisting !== false;
  const results = [];

  for (const entry of SEED_CATALOG) {
    if (skipExisting) {
      const existing = await prisma.universalAsset.findFirst({
        where: {
          provider: entry.provider,
          title: entry.title,
        },
      });
      if (existing) {
        results.push({ key: entry.key, skipped: true, assetId: existing.id });
        continue;
      }
    }

    const created = await createUniversalAsset(prisma, {
      ...entry,
      ownerId,
      rightsStatus: RIGHTS_STATUS.CLEARED,
      status: ASSET_STATUS.NORMALIZED,
    });

    if (created.ok) {
      results.push({ key: entry.key, created: true, assetId: created.asset.id });
    } else {
      results.push({ key: entry.key, created: false, error: created.error });
    }
  }

  return { ok: true, seeded: results.length, results };
}

export default seedCuratedCatalog;
