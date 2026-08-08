/**
 * Phase 3 discovery browse — real catalogue only by default.
 * Fixtures excluded unless ENABLE_UNIVERSAL_LIBRARY_FIXTURES_V1=true.
 */

import { ASSET_STATUS } from './universalAssetTypes.js';
import { INDUSTRIES, ASSET_ROLES } from './richSeedCatalog.js';
import { listCollections } from './collectionService.js';
import { toPublicAssetList } from './publicAssetView.js';
import {
  CONTENT_ORIGIN,
  fixturesEnabled,
  isDevelopmentFixture,
  getContentOrigin,
} from './contentOrigin.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [filters]
 */
export async function browseDiscovery(prisma, filters = {}) {
  const industry = filters.industry ? String(filters.industry).toLowerCase() : null;
  const subCategory = filters.subCategory ? String(filters.subCategory).toLowerCase() : null;
  const type = filters.type ? String(filters.type).toLowerCase() : null;
  const role = filters.role ? String(filters.role).toLowerCase() : null;
  const openLicense = filters.openLicense === true || filters.openLicense === 'true';
  const premium = filters.premium === true || filters.premium === 'true';
  const creatorOnly = filters.creator === true || filters.creator === 'true';
  const includeFixtures = filters.includeFixtures === true || filters.includeFixtures === 'true';
  const q = filters.q ? String(filters.q).trim().toLowerCase() : '';
  const take = Math.min(Math.max(Number(filters.limit) || 48, 1), 120);
  const showFixtures = includeFixtures && fixturesEnabled();

  const items = await prisma.universalAsset.findMany({
    where: { status: ASSET_STATUS.PUBLISHED },
    include: { discoveryScore: true },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  });

  const allPublished = items;
  let rows = items.filter((a) => (showFixtures ? true : !isDevelopmentFixture(a)));

  const fixtureCount = allPublished.filter((a) => isDevelopmentFixture(a)).length;
  const realCount = allPublished.length - fixtureCount;

  if (industry) {
    rows = rows.filter((a) => {
      const cats = Array.isArray(a.categories) ? a.categories.map((c) => String(c).toLowerCase()) : [];
      const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      const ind = String(meta.industry || '').toLowerCase();
      if (industry === 'food-drink') {
        return (
          cats.includes('food-drink') ||
          ['bakery', 'cafe', 'restaurant'].includes(ind) ||
          cats.some((c) => ['bakery', 'cafe', 'restaurant'].includes(c))
        );
      }
      return ind === industry || cats.includes(industry);
    });
  }
  if (subCategory) {
    rows = rows.filter((a) => {
      const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      return String(meta.subCategory || '').toLowerCase() === subCategory;
    });
  }
  if (type) {
    rows = rows.filter((a) => String(a.type).toLowerCase() === type);
  }
  if (role) {
    rows = rows.filter((a) => {
      const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      return String(meta.assetRole || '').toLowerCase() === role;
    });
  }
  if (openLicense) {
    rows = rows.filter((a) => {
      const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      const lic = String(a.license || '').toLowerCase();
      return meta.openLicense === true || lic.includes('cardbey-internal') || lic.includes('open');
    });
  }
  if (premium) {
    // Premium only when a real marketplace listing id exists — never fixture premium flags
    rows = rows.filter((a) => {
      const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      return Boolean(meta.marketplaceListingId) && !isDevelopmentFixture(a);
    });
  }
  if (creatorOnly) {
    rows = rows.filter((a) => {
      if (!a.creatorId) return false;
      const origin = getContentOrigin(a);
      return origin === CONTENT_ORIGIN.REAL_CREATOR || origin === CONTENT_ORIGIN.REAL_FIRST_PARTY;
    });
  }
  if (q) {
    rows = rows.filter((a) => {
      const hay = `${a.title} ${a.description || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const sliced = rows.slice(0, take);
  const admin = Boolean(filters.admin);
  const assets = sliced.map((row) => {
    const publicRow = toPublicAssetList([row], { admin })[0];
    return enrichCard({ ...publicRow, metadata: row.metadata });
  });

  // Industry chips: only industries with real (non-fixture) published assets — global, not filter-scoped
  const realPublished = allPublished.filter((a) => !isDevelopmentFixture(a));
  /** @type {Map<string, number>} */
  const industryCounts = new Map();
  for (const a of realPublished) {
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    const ind = String(meta.industry || (Array.isArray(a.categories) ? a.categories[0] : '') || '')
      .toLowerCase()
      .trim();
    if (!ind) continue;
    // Collapse cafe/bakery/restaurant under food-drink chip when food-drink present
    const chip = ['bakery', 'cafe', 'restaurant'].includes(ind) ? 'food-drink' : ind;
    industryCounts.set(chip, (industryCounts.get(chip) || 0) + 1);
    if (chip === 'food-drink' && ind !== 'food-drink') {
      industryCounts.set(ind, (industryCounts.get(ind) || 0) + 1);
    }
  }
  const industryNames = {
    'food-drink': 'Food & Drink',
    beauty: 'Beauty',
    hair: 'Hair',
    retail: 'Retail',
    fashion: 'Fashion',
    'home-services': 'Home Services',
    education: 'Education',
    fitness: 'Fitness',
    travel: 'Travel',
    bakery: 'Bakery',
    cafe: 'Café',
    restaurant: 'Restaurant',
  };
  const industries = [...industryCounts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([slug, count]) => ({
      slug,
      name: industryNames[slug] || slug,
      count,
    }));

  const types = [
    { id: 'all', label: 'All' },
    ...ASSET_ROLES.reduce((acc, r) => {
      if (!acc.find((x) => x.id === r.type)) acc.push({ id: r.type, label: r.type });
      return acc;
    }, /** @type {{id:string,label:string}[]} */ ([])),
  ];

  const collectionsRes = await listCollections(prisma);
  const collections = (collectionsRes.collections || [])
    .map((c) => {
      const realAssets = (c.assets || []).filter((a) => !isDevelopmentFixture(a));
      return {
        slug: c.slug,
        name: c.name,
        description: c.description,
        assetCount: realAssets.length,
        curator: c.curator || 'Cardbey',
        assets: realAssets.map((row) => {
          const publicRow = toPublicAssetList([row], { admin })[0];
          return enrichCard({ ...publicRow, metadata: row.metadata });
        }).slice(0, 12),
      };
    })
    .filter((c) => c.assetCount > 0);

  /** @type {Map<string, { id: string, label: string, verifiedType: string|null, assetCount: number }>} */
  const creators = new Map();
  for (const a of realPublished) {
    if (!a.creatorId) continue;
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    const verifiedType = resolveVerifiedType(meta, getContentOrigin(a));
    const prev = creators.get(a.creatorId) || {
      id: a.creatorId,
      label: String(meta.creatorLabel || a.creatorId),
      verifiedType,
      assetCount: 0,
    };
    prev.assetCount += 1;
    creators.set(a.creatorId, prev);
  }

  const freeGlobal = realPublished.filter((a) => {
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    return !meta.marketplaceListingId;
  }).length;
  const pexelsCount = realPublished.filter((a) => String(a.provider || '').toLowerCase() === 'pexels')
    .length;

  const sparseThreshold = Math.min(
    Math.max(Number(process.env.LIBRARY_SPARSE_CATEGORY_THRESHOLD) || 8, 1),
    48,
  );
  const filterActive = Boolean(industry || type || role || openLicense || premium || creatorOnly || q);
  /** @type {null | object} */
  let sparse = null;
  if (filterActive && rows.length < sparseThreshold) {
    const siblingIndustries = industries
      .filter((i) => i.slug !== industry && i.count > 0)
      .slice(0, 6);
    const relatedCollections = collections
      .filter((c) => {
        if (!industry) return true;
        return (c.assets || []).some((a) => String(a.industry || '').toLowerCase() === industry);
      })
      .slice(0, 4);
    const recentlyAdded = realPublished
      .slice(0, 8)
      .map((row) => {
        const publicRow = toPublicAssetList([row], { admin })[0];
        return enrichCard({ ...publicRow, metadata: row.metadata });
      });
    const relatedCreators = [...creators.values()]
      .filter((c) => {
        if (!industry) return true;
        return realPublished.some((a) => {
          if (a.creatorId !== c.id) return false;
          const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
          return String(meta.industry || '').toLowerCase() === industry;
        });
      })
      .slice(0, 6);
    sparse = {
      threshold: sparseThreshold,
      matching: rows.length,
      relatedCollections,
      siblingIndustries,
      recentlyAdded,
      relatedCreators,
    };
  }

  return {
    ok: true,
    dimensions: { industries, types, roles: ASSET_ROLES.map((r) => ({ id: r.role, label: r.label })) },
    filters: { industry, subCategory, type, role, openLicense, premium, creatorOnly, q, showFixtures },
    total: rows.length,
    // Global catalogue summary — never filter-scoped
    summary: {
      realAssets: realCount,
      fixturesExcluded: showFixtures ? 0 : fixtureCount,
      fixturesTotal: fixtureCount,
      industries: industries.length,
      collections: collections.length,
      creators: creators.size,
      free: freeGlobal,
      premiumReady: realPublished.filter((a) => a.metadata?.marketplaceListingId).length,
      referenceOnly: realPublished.filter((a) => getContentOrigin(a) === CONTENT_ORIGIN.REFERENCE_ONLY)
        .length,
      pexelsAssets: pexelsCount,
      requiresPexelsAttribution: pexelsCount > 0,
    },
    filtered: {
      active: filterActive,
      matching: rows.length,
    },
    sparse,
    assets,
    collections,
    creators: [...creators.values()].sort((a, b) => b.assetCount - a.assetCount),
    breadcrumb: buildBreadcrumb({ industry, subCategory, type, role }),
  };
}

function resolveVerifiedType(meta, origin) {
  if (meta.verifiedType) return String(meta.verifiedType);
  if (origin === CONTENT_ORIGIN.REAL_FIRST_PARTY) return 'FIRST_PARTY_VERIFIED';
  if (origin === CONTENT_ORIGIN.REAL_CREATOR && meta.creatorVerified) return 'CREATOR_IDENTITY_VERIFIED';
  if (origin === CONTENT_ORIGIN.REAL_PROVIDER) return 'PROVIDER_VERIFIED';
  if (meta.rightsVerified) return 'RIGHTS_VERIFIED';
  return null;
}

function enrichCard(asset) {
  const meta = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  const fixture = isDevelopmentFixture({
    metadata: meta,
    creatorId: asset.creatorId,
    title: asset.title,
    provider: asset.provider,
  });
  const synthetic = meta.syntheticEngagement === true || fixture;
  const hasListing = Boolean(meta.marketplaceListingId);
  const origin = meta.contentOrigin || CONTENT_ORIGIN.LEGACY_UNKNOWN;
  const verifiedType = fixture ? null : resolveVerifiedType(meta, origin);

  const attribution =
    meta.attribution && typeof meta.attribution === 'object' ? meta.attribution : null;
  const isPexels =
    String(asset.provider || '').toLowerCase() === 'pexels' ||
    String(asset.license || '').toLowerCase().includes('pexels') ||
    String(meta.source || '').toLowerCase() === 'pexels';

  return {
    ...asset,
    industry: meta.industry || (Array.isArray(asset.categories) ? asset.categories[0] : null),
    assetRole: meta.assetRole || null,
    contentOrigin: origin,
    license: asset.license || meta.license || null,
    premium: hasListing && !fixture,
    openLicense: !hasListing && meta.openLicense !== false,
    creatorLabel: fixture ? null : meta.creatorLabel || null,
    verifiedType,
    creatorVerified: Boolean(verifiedType),
    views: synthetic ? null : meta.views != null && Number(meta.views) > 0 ? Number(meta.views) : null,
    downloads:
      synthetic ? null : meta.downloads != null && Number(meta.downloads) > 0 ? Number(meta.downloads) : null,
    rating: synthetic ? null : meta.rating != null && Number(meta.rating) > 0 ? Number(meta.rating) : null,
    isNew: !synthetic && !(Number(meta.views) > 0) && !(Number(meta.downloads) > 0),
    isFixture: fixture,
    fixtureLabel: fixture ? 'Development fixture' : null,
    collections: Array.isArray(meta.collections) ? meta.collections : [],
    useCases: Array.isArray(meta.useCases) ? meta.useCases : [],
    provider: asset.provider || null,
    isPexels,
    attributionName: attribution?.name || (isPexels ? meta.creatorLabel : null) || null,
    attributionUrl: attribution?.url || null,
    attributionNote: attribution?.note || null,
  };
}

function buildBreadcrumb({ industry, subCategory, type, role }) {
  const parts = [{ label: 'Library', slug: null }];
  if (industry) parts.push({ label: industry, slug: industry });
  if (subCategory) parts.push({ label: subCategory, slug: subCategory });
  if (type) parts.push({ label: type, slug: type });
  if (role) parts.push({ label: role, slug: role });
  return parts;
}
