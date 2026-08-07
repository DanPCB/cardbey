/**
 * Phase 3B — curated real collections (canonical asset references only).
 */

import { ASSET_STATUS, ENTITY_KIND } from './universalAssetTypes.js';
import { isDevelopmentFixture, CONTENT_ORIGIN, getContentOrigin } from './contentOrigin.js';
import { upsertTaxonomyEntity } from './taxonomyService.js';

export const REAL_COLLECTION_DEFS = Object.freeze([
  {
    slug: 'cardbey-originals',
    name: 'Cardbey Originals',
    description: 'First-party Cardbey owned media and templates.',
    type: 'CARDBEY_ORIGINALS',
    match: (a, meta) => getContentOrigin(a) === CONTENT_ORIGIN.REAL_FIRST_PARTY,
  },
  {
    slug: 'french-cafe-starter',
    name: 'French Café Starter Kit',
    description: 'Food & drink visuals and templates for café launches.',
    type: 'INDUSTRY_STARTER_PACK',
    match: (a, meta) =>
      ['food-drink', 'cafe', 'restaurant', 'bakery'].includes(String(meta.industry || '')) ||
      (Array.isArray(a.categories) &&
        a.categories.some((c) => ['food-drink', 'cafe', 'restaurant'].includes(String(c)))),
  },
  {
    slug: 'beauty-salon-launch',
    name: 'Beauty Salon Launch Pack',
    description: 'Beauty and hair visuals for salon marketing.',
    type: 'INDUSTRY_STARTER_PACK',
    match: (a, meta) =>
      ['beauty', 'hair'].includes(String(meta.industry || '')) ||
      (Array.isArray(a.categories) &&
        a.categories.some((c) => ['beauty', 'hair'].includes(String(c)))),
  },
  {
    slug: 'retail-storefront-starter',
    name: 'Retail Storefront Starter Pack',
    description: 'Retail and fashion storefront templates and photos.',
    type: 'INDUSTRY_STARTER_PACK',
    match: (a, meta) =>
      ['retail', 'fashion'].includes(String(meta.industry || '')) ||
      (Array.isArray(a.categories) &&
        a.categories.some((c) => ['retail', 'fashion'].includes(String(c)))),
  },
  {
    slug: 'home-services-promo',
    name: 'Home Services Promotion Pack',
    description: 'Home services and trades marketing visuals.',
    type: 'INDUSTRY_STARTER_PACK',
    match: (a, meta) =>
      String(meta.industry || '') === 'home-services' ||
      (Array.isArray(a.categories) && a.categories.map(String).includes('home-services')),
  },
  {
    slug: 'open-media-essentials',
    name: 'Open Media Essentials',
    description: 'Approved open-licence / provider reference media.',
    type: 'OPEN_LICENSE',
    match: (a, meta) =>
      getContentOrigin(a) === CONTENT_ORIGIN.REAL_PROVIDER ||
      String(a.license || '').toLowerCase().includes('pexels'),
  },
]);

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function publishRealCollections(prisma) {
  const assets = await prisma.universalAsset.findMany({
    where: { status: ASSET_STATUS.PUBLISHED },
    take: 3000,
  });
  const real = assets.filter((a) => !isDevelopmentFixture(a));

  const published = [];
  for (const def of REAL_COLLECTION_DEFS) {
    const members = real
      .filter((a) => {
        const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
        return def.match(a, meta);
      })
      .slice(0, 48);

    await upsertTaxonomyEntity(prisma, {
      kind: ENTITY_KIND.COLLECTION,
      name: def.name,
      slug: def.slug,
      metadata: {
        description: def.description,
        collectionType: def.type,
        curator: 'Cardbey Library Editorial',
        curatorId: 'cardbey_library_editorial',
        dimension: 'collection',
        assetIds: members.map((m) => m.id),
        assetCount: members.length,
        industries: [...new Set(members.map((m) => {
          const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : {};
          return String(meta.industry || (Array.isArray(m.categories) ? m.categories[0] : '') || '');
        }).filter(Boolean))],
        assetTypes: [...new Set(members.map((m) => m.type).filter(Boolean))],
        rightsSummary:
          def.type === 'OPEN_LICENSE'
            ? 'Open / provider licence — attribution required where noted'
            : def.type === 'CARDBEY_ORIGINALS'
              ? 'Cardbey first-party · internal licence'
              : 'Mixed rights-compatible members · check asset licence',
        lastUpdated: new Date().toISOString(),
      },
    });

    for (const member of members) {
      const meta = member.metadata && typeof member.metadata === 'object' ? member.metadata : {};
      const cols = new Set([...(Array.isArray(meta.collections) ? meta.collections : []), def.slug]);
      await prisma.universalAsset.update({
        where: { id: member.id },
        data: { metadata: { ...meta, collections: [...cols] } },
      });
    }

    published.push({ slug: def.slug, name: def.name, assetCount: members.length });
  }

  return { ok: true, collections: published };
}
