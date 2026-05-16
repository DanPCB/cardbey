/**
 * Storefront Routes
 * Public, no auth. Frontscreen and published store feed.
 *
 * CONTRACT (Step 5): Reads published snapshot only. All fields (heroImageUrl, avatarImageUrl,
 * publishedAt) come from the Business row — source of truth. No draft or computed values.
 * There is no separate PublishedStore table; Business with isActive === true is the published entity.
 *
 * Type filtering (Food | Products | Services): Aligns with Explore tabs so food stores
 * appear under Food, retail/product stores under Products, and service stores under Services.
 */

import express from 'express';
import { getPrismaClient } from '../lib/prisma.js';

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
router.get('/frontscreen', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
    const typeParam = (req.query.type && String(req.query.type).trim()) || null;
    const prisma = getPrismaClient();

    let stores = await prisma.business.findMany({
      where: { isActive: true },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      take: typeParam ? limit * 3 : limit,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        heroImageUrl: true,
        avatarImageUrl: true,
        publishedAt: true,
        description: true,
      },
    });

    if (typeParam) {
      stores = stores.filter((s) => businessMatchesType(s.type, typeParam)).slice(0, limit);
    }

    return res.json({
      ok: true,
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        type: s.type,
        heroImageUrl: s.heroImageUrl ?? null,
        avatarImageUrl: s.avatarImageUrl ?? null,
        publishedAt: s.publishedAt?.toISOString?.() ?? null,
        description: s.description ?? null,
      })),
    });
  } catch (error) {
    console.error('[Storefront] frontscreen error:', error);
    next(error);
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
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        tagline: true,
        heroImageUrl: true,
        avatarImageUrl: true,
        logo: true,
        publishedAt: true,
        storefrontSettings: true,
      },
    });

    let filteredRows = typeParam ? rows.filter((s) => businessMatchesType(s.type, typeParam)).slice(0, limit * 2) : rows;
    const items = [];
    for (const s of filteredRows) {
      const name = (s.name && String(s.name).trim()) || null;
      if (!name) continue;

      let heroImageUrl = (s.heroImageUrl && String(s.heroImageUrl).trim()) || null;
      const avatarImageUrl = (s.avatarImageUrl && String(s.avatarImageUrl).trim()) || null;
      if (!heroImageUrl && s.logo) {
        try {
          const logoData = typeof s.logo === 'string' ? JSON.parse(s.logo) : s.logo;
          const logoUrl = logoData?.bannerUrl ?? logoData?.heroUrl ?? logoData?.coverUrl ?? logoData?.avatarUrl ?? logoData?.url ?? null;
          if (logoUrl && String(logoUrl).trim()) heroImageUrl = String(logoUrl).trim();
        } catch {
          // ignore
        }
      }
      if (!heroImageUrl && avatarImageUrl) heroImageUrl = avatarImageUrl;
      if (!heroImageUrl) continue;

      const storeUrl = `/preview/store/${s.id}`;
      const publishedAtIso = s.publishedAt?.toISOString?.() ?? null;
      const storefrontSettings = jsonToPlainObject(s.storefrontSettings);
      items.push({
        storeId: s.id,
        storeName: name,
        heroImageUrl,
        avatarUrl: avatarImageUrl || heroImageUrl,
        tagline: (s.tagline && String(s.tagline).trim()) || null,
        storeUrl,
        publishedAt: publishedAtIso,
        storefrontSettings,
        // backward compatibility for frontend expecting items with id, name, avatarImageUrl
        id: s.id,
        name,
        slug: s.slug ?? null,
        type: s.type ?? null,
        avatarImageUrl: avatarImageUrl || heroImageUrl,
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
      })),
    });
  } catch (error) {
    console.error('[Storefront] homepage-stores error:', error);
    next(error);
  }
});

export default router;
