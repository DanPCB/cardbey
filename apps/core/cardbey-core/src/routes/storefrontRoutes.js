/**
 * Storefront Routes
 * Public, no auth. Frontscreen and published store feed.
 *
 * CONTRACT (Step 5): Reads published snapshot only. All fields (heroImageUrl, heroVideo,
 * avatarImageUrl, publishedAt) come from the published projection — not draft-only values.
 * Dashboard frontscreen MUST map via mapFrontscreenStoreFromApi (video → bannerUrl + <video> render).
 * There is no separate PublishedStore table; Business with isActive === true is the published entity.
 *
 * Type filtering (Food | Products | Services): Aligns with Explore tabs so food stores
 * appear under Food, retail/product stores under Products, and service stores under Services.
 */

import express from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { publicWebBase } from '../utils/publicWebBase.js';
import { businessPublicReadSelect, publicCommerceFields } from '../lib/dbCapabilities.js';
import { resolvePublicStoreFromArtifact } from '../services/publishedArtifactProjection/getPublishedBusinessArtifact.js';
import { resolvePublicStoresForList } from '../services/publishedArtifactProjection/resolvePublicStoreList.js';
import {
  assemblePublicFeedItems,
  publicStoreResultToFeedItem,
} from '../services/feed/assemblePublicFeedItems.js';
import { enrichStoreHeroVideoUrls } from '../lib/videoIosSafe.js';
import { resolvePublicStoreMediaUrls } from '../utils/publicUrl.js';
import { isPublicFeedEligibleBusiness } from '../utils/publicStoreVisibility.js';
import { optionalAuth } from '../middleware/auth.js';
import { attachStoreEngagementToPublicStores } from '../services/storeEngagement/attachStoreEngagementToPublicStores.js';
import { attachStoreReviewsToPublicStores } from '../services/storeReview/attachStoreReviewsToPublicStores.js';

const router = express.Router();

// Match dashboard storefrontLayoutMode + storeType (food / retail / service) for Explore category filtering
const FOOD_KEYWORDS = [
  'restaurant', 'cafe', 'coffee', 'bakery', 'baker', 'food', 'dining', 'eatery',
  'catering', 'pizza', 'bar', 'pub', 'brunch', 'kitchen',
];
const RETAIL_KEYWORDS = [
  'retail', 'shop', 'store', 'boutique', 'market', 'gallery', 'merchandise',
];
const SERVICE_KEYWORDS = [
  'service', 'services', 'beauty', 'salon', 'spa', 'barber', 'hair', 'wellness',
  'cleaning', 'repair', 'mechanic', 'clinic', 'dentist', 'physio', 'office',
];

/**
 * Returns true if business type string matches the API category (Food | Products | Services).
 * Used so /frontscreen?type=Food shows only food stores, not products or services.
 */
function jsonToPlainObject(val) {
  if (val == null) return null;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const o = JSON.parse(val);
      return typeof o === 'object' && o && !Array.isArray(o) ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

function businessMatchesType(businessType, apiType) {
  const t = (businessType ?? '').toLowerCase().trim();
  if (!apiType || !t) return true; // no filter
  const type = apiType.toLowerCase();
  if (type === 'food') return FOOD_KEYWORDS.some((k) => t.includes(k));
  if (type === 'products') return RETAIL_KEYWORDS.some((k) => t.includes(k));
  if (type === 'services') return SERVICE_KEYWORDS.some((k) => t.includes(k));
  return true;
}

/**
 * GET /api/storefront/frontscreen
 * Returns published stores only (Business isActive === true). Optional query: type=Food|Products|Services
 * to filter by store category so food stores appear under Food tab, not Products. Contract-true: heroImageUrl,
 * avatarImageUrl, and publishedAt are from the published entity (Business), not from draft.
 */
router.get('/frontscreen', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
    const typeParam = (req.query.type && String(req.query.type).trim()) || null;
    const prisma = getPrismaClient();

    let stores = await prisma.business.findMany({
      where: { isActive: true },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      take: typeParam ? limit * 3 : limit,
      select: businessPublicReadSelect(),
    });

    if (typeParam) {
      stores = stores.filter((s) => businessMatchesType(s.type, typeParam)).slice(0, limit);
    }

    stores = stores.filter(isPublicFeedEligibleBusiness);

    const webBase = publicWebBase();
    const resolved = await resolvePublicStoresForList(prisma, stores, {
      route: 'GET /api/storefront/frontscreen',
      req,
    });
    const feedItems = assemblePublicFeedItems(
      resolved.map((row, rank) =>
        publicStoreResultToFeedItem(row, { source: 'frontscreen', rank }),
      ),
    );
    const mapped = feedItems.map(({ store: pub }) => {
      const slug = pub.slug ?? null;
      return resolvePublicStoreMediaUrls(
        enrichStoreHeroVideoUrls(
          {
            id: pub.id,
            name: pub.name,
            slug,
            type: pub.type ?? null,
            heroImageUrl: pub.heroUrl ?? pub.heroImage ?? null,
            heroVideo: pub.heroVideo ?? null,
            avatarImageUrl: pub.avatarUrl ?? null,
            publishedAt: pub.publishedAt ?? null,
            description: pub.description ?? null,
            tagline: pub.tagline ?? null,
            website: pub.website ?? null,
            liveUrl: slug ? `${webBase}/s/${encodeURIComponent(slug)}` : null,
            ...publicCommerceFields(pub, pub),
            storefrontSettings: pub.storefrontSettings ?? null,
            socialLinks: pub.socialLinks ?? null,
          },
          { uploadsDir: process.env.UPLOADS_DIR },
        ),
        req,
      );
    });

    let storesWithEngagement = await attachStoreEngagementToPublicStores(prisma, mapped, req);
    storesWithEngagement = await attachStoreReviewsToPublicStores(prisma, storesWithEngagement, req);

    return res.json({
      ok: true,
      stores: storesWithEngagement,
      total: storesWithEngagement.length,
    });
  } catch (error) {
    const msg = error?.message ?? String(error);
    console.error('[frontscreen] query failed:', msg, error?.stack?.split('\n')?.[1] ?? '');
    return res.json({ ok: true, stores: [], total: 0 });
  }
});

/**
 * GET /api/storefront/homepage-stores
 * Returns stores eligible for homepage hero slideshow: published, valid name, hero or avatar/logo image, store URL.
 * Optional query: type=Food|Products|Services to filter by category (same as frontscreen).
 * Order: publishedAt DESC (newest first).
 */
router.get('/homepage-stores', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 50);
    const typeParam = (req.query.type && String(req.query.type).trim()) || null;
    const prisma = getPrismaClient();

    const rows = await prisma.business.findMany({
      where: { isActive: true },
      orderBy: [
        { publishedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: typeParam ? limit * 3 : limit * 2,
      select: businessPublicReadSelect(),
    });

    let filteredRows = typeParam ? rows.filter((s) => businessMatchesType(s.type, typeParam)).slice(0, limit * 2) : rows;
    const webBase = publicWebBase();
    const items = [];
    for (const s of filteredRows) {
      const { store: pub } = await resolvePublicStoreFromArtifact(prisma, s);
      const name = (pub.name && String(pub.name).trim()) || null;
      if (!name) continue;

      const heroImageUrl = (pub.heroUrl && String(pub.heroUrl).trim()) || null;
      const avatarImageUrl = (pub.avatarUrl && String(pub.avatarUrl).trim()) || null;
      if (!heroImageUrl) continue;

      const slug = pub.slug ?? s.slug;
      const storeUrl = slug
        ? `${webBase}/s/${encodeURIComponent(slug)}`
        : `/preview/store/${s.id}`;
      const publishedAtIso = s.publishedAt?.toISOString?.() ?? null;
      const storefrontSettings = pub.storefrontSettings ?? jsonToPlainObject(s.storefrontSettings);
      items.push({
        storeId: s.id,
        storeName: name,
        heroImageUrl,
        heroVideo: pub.heroVideo ?? null,
        avatarUrl: avatarImageUrl || heroImageUrl,
        tagline: (pub.tagline && String(pub.tagline).trim()) || (pub.description && String(pub.description).trim()) || null,
        description: pub.description ?? null,
        website: pub.website ?? null,
        liveUrl: slug ? `${webBase}/s/${encodeURIComponent(slug)}` : null,
        storeUrl,
        publishedAt: publishedAtIso,
        storefrontSettings,
        id: s.id,
        name,
        slug: slug ?? null,
        type: pub.type ?? s.type ?? null,
        avatarImageUrl: avatarImageUrl || heroImageUrl,
        socialLinks: pub.socialLinks ?? null,
        ...publicCommerceFields(s, pub),
      });
      if (items.length >= limit) break;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[storefront.homepage-stores] eligible stores count:', items.length);
      console.log('[storefront.homepage-stores] first store:', items[0] ? `${items[0].storeId} / ${items[0].storeName}` : 'none');
    }

    const stores = items.map((it) => ({
      storeId: it.storeId,
      storeName: it.storeName,
      heroImageUrl: it.heroImageUrl,
      avatarUrl: it.avatarUrl,
      tagline: it.tagline,
      storeUrl: it.storeUrl,
      publishedAt: it.publishedAt,
    }));

    return res.json({
      ok: true,
      stores,
      items: items.map((it) => ({
        id: it.id,
        name: it.name,
        slug: it.slug,
        type: it.type,
        tagline: it.tagline,
        heroImageUrl: it.heroImageUrl,
        avatarImageUrl: it.avatarImageUrl,
        storeUrl: it.storeUrl,
        publishedAt: it.publishedAt,
        storefrontSettings: it.storefrontSettings ?? null,
        ...publicCommerceFields(it, it),
      })),
    });
  } catch (error) {
    const msg = error?.message ?? String(error);
    console.error('[homepage-stores] query failed:', msg, error?.stack?.split('\n')?.[1] ?? '');
    return res.json({ ok: true, stores: [], items: [], total: 0 });
  }
});

export default router;
