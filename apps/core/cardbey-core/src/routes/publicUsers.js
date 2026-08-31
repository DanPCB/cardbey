/**
 * Public Users Routes
 * Public profile endpoints (no authentication required)
 */

import { Router } from 'express';
import { toPublicUserProfile } from '../utils/publicProfileMapper.js';
import { resolvePublicStoreFromArtifact } from '../services/publishedArtifactProjection/getPublishedBusinessArtifact.js';
import { enrichStoreHeroVideoUrls } from '../lib/videoIosSafe.js';
import { getBaseUrlFromRequest, resolvePublicStoreMediaUrls } from '../utils/publicUrl.js';
import {
  needsDurableHeroVideoIngest,
  rewriteHotlinkHeroVideoForPlayback,
} from '../lib/media/externalHeroVideoPlayback.js';
import {
  resolvePublicStoresForList,
} from '../services/publishedArtifactProjection/resolvePublicStoreList.js';
import {
  assemblePublicFeedItems,
  logPublicFeedAssembly,
  publicStoreResultToFeedItem,
} from '../services/feed/assemblePublicFeedItems.js';
import {
  findPublicBusinesses,
  findPublicBusinessByUnique,
  publicStoreListWhere,
} from '../services/publishedArtifactProjection/findPublicBusinesses.js';
import { getBusinessColumnSupport } from '../lib/businessColumnCapabilities.js';
import { getPublishedBusinessArtifact } from '../services/publishedArtifactProjection/getPublishedBusinessArtifact.js';
import { publicWebBase } from '../utils/publicWebBase.js';
import { parseSocialLinks } from '../lib/socialLinks.js';
import { listStoreProducts, parseProductPagination } from '../lib/listStoreProducts.js';
import { parseDocumentIngestionContext } from '../lib/documentIngestion/documentAwareConcierge.js';

import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { attachStoreEngagementToPublicStores } from '../services/storeEngagement/attachStoreEngagementToPublicStores.js';
import { isGhostStoreRemoved, isPublicFeedEligibleBusiness } from '../utils/publicStoreVisibility.js';
import { filterBusinessesForFeedCategory } from '../lib/businessSemantic/resolveStoreCommercePresentation.js';
import { loadActiveFeedPromoArtifacts } from '../services/feed/loadActiveFeedPromoArtifacts.js';
import { getRelatedBusinessesForSlug } from '../lib/relatedBusinesses/relatedBusinessService.js';
import { resolveCuratedCollections } from '../services/feed/resolveCuratedCollections.js';
import { caseInsensitiveFilter } from '../lib/dbCapabilities.js';
import { hasBusinessColumn } from '../lib/businessColumnCapabilities.js';
import { normalizeSuburbLabel } from '../utils/normalizeSuburbLabel.js';

const router = Router();
/**
 * GET /api/public/users/:handle
 * Get public user profile by handle
 * 
 * No authentication required
 * 
 * Response (200):
 *   - ok: true
 *   - profile: PublicUserProfile
 * 
 * Errors:
 *   - 404: User not found
 */
router.get('/users/:handle', async (req, res, next) => {
  try {
    const { handle } = req.params;

    console.log(`[PublicUsers] Fetching profile for handle: "${handle}"`);

    if (!handle || typeof handle !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid handle',
        message: 'Handle is required'
      });
    }

    // Normalize handle to lowercase for case-insensitive lookup
    // Handles are stored in lowercase (from generateHandle function)
    const normalizedHandle = handle.toLowerCase().trim();

    // Find user by handle (case-insensitive), include businesses
    const user = await prisma.user.findUnique({
      where: { handle: normalizedHandle },
      include: {
        business: true, // Business is one-to-one, but we'll treat as array
      }
    });

    if (!user) {
      console.log(`[PublicUsers] User not found for handle: "${handle}"`);
      // Debug: Check if any users exist with similar handles
      const allUsers = await prisma.user.findMany({
        select: { id: true, email: true, handle: true },
        take: 5
      });
      console.log(`[PublicUsers] Sample users in DB:`, allUsers.map(u => ({ email: u.email, handle: u.handle })));
      
      return res.status(404).json({
        ok: false,
        error: 'User not found',
        message: 'User not found'
      });
    }

    console.log(`[PublicUsers] Found user: ${user.id} (${user.email}) with handle: "${user.handle}"`);

    // Map to public profile (excludes sensitive data)
    const businesses = user.business ? [user.business] : [];
    const profile = toPublicUserProfile(user, businesses);

    res.json({
      ok: true,
      profile
    });
  } catch (error) {
    console.error('[PublicUsers] Error fetching public profile:', error);
    next(error);
  }
});

/**
 * Frontscreen contract: PUBLIC Explore — shows all public published stores matching the category (mode).
 * Not "MY Explore"; no auth. MY STORES (from GET /api/auth/me) is separate and user-scoped.
 *
 * Use keyword-in-type matching (case-insensitive) so "Vietnamese Restaurant" matches food (restaurant),
 * and food stores do not appear under Products. Aligns with storefrontRoutes.js and dashboard storefrontLayoutMode.
 */
const FEED_CATEGORY_KEYWORDS = {
  food: [
    'restaurant', 'cafe', 'coffee', 'bakery', 'baker', 'food', 'dining', 'eatery',
    'catering', 'pizza', 'bar', 'pub', 'brunch', 'kitchen', 'bistro', 'takeaway', 'take away', 'vietnamese',
  ],
  products: [
    'retail', 'shop', 'store', 'boutique', 'market', 'gallery', 'merchandise', 'florist', 'clothing', 'fashion', 'apparel',
  ],
  services: [
    'service', 'services', 'beauty', 'salon', 'spa', 'barber', 'hair', 'wellness',
    'cleaning', 'repair', 'mechanic', 'clinic', 'dentist', 'physio', 'office', 'nails',
    'nail', 'manicure', 'pedicure', 'massage', 'facial', 'tiling', 'flooring', 'tiler',
    'renovation', 'plumbing', 'electrician', 'painting', 'construction', 'contractor',
    'builder', 'signage', 'quote', 'booking',
  ],
};

function businessTypeMatchesCategory(businessType, category) {
  const t = (businessType ?? '').toLowerCase().trim();
  if (!category || !t) return true;
  const keywords = FEED_CATEGORY_KEYWORDS[category];
  if (!keywords) return true;
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

function parseFeedSuburbQuery(raw) {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function parseFeedCategoryQuery(raw) {
  const category = typeof raw === 'string' ? raw.trim().toLowerCase() : null;
  return category && FEED_CATEGORY_KEYWORDS[category] ? category : null;
}

function buildPublicFeedListWhere({ suburb = null } = {}) {
  const where = publicStoreListWhere();
  const suburbFilter = parseFeedSuburbQuery(suburb);
  if (!suburbFilter || !hasBusinessColumn('suburb')) return where;
  return {
    ...where,
    suburb: caseInsensitiveFilter(suburbFilter),
  };
}

/**
 * @param {Array<{ suburb?: string | null }>} businesses
 * @returns {Array<{ suburb: string, count: number }>}
 */
export function aggregatePublicStoreSuburbs(businesses) {
  const counts = new Map();
  for (const business of businesses) {
    const suburb = normalizeSuburbLabel(business?.suburb);
    if (!suburb) continue;
    const key = suburb.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { suburb, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.suburb.localeCompare(b.suburb));
}

function businessMatchesSuburbFilter(business, suburbRaw) {
  const target = normalizeSuburbLabel(parseFeedSuburbQuery(suburbRaw));
  if (!target) return true;
  return normalizeSuburbLabel(business?.suburb)?.toLowerCase() === target.toLowerCase();
}

/**
 * GET /api/public/stores/feed
 * Paginated feed of active public stores (for reels/frontscreen).
 * No authentication required.
 *
 * Query: limit (default 10), cursor (opaque), category (optional: food|products|services), suburb (optional)
 * Order: publishedAt DESC, updatedAt DESC, id DESC (tie-break) when publishedAt column exists;
 *         otherwise createdAt DESC, id DESC.
 * Response: { items: PublicStore[], nextCursor: string | null }
 */
router.get('/stores/feed', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 50);
    const cursorRaw = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const categoryRaw = parseFeedCategoryQuery(req.query.category);
    const suburbRaw = parseFeedSuburbQuery(req.query.suburb);
    const supportsPublishedAt = getBusinessColumnSupport().publishedAt;
    let cursor = null;
    if (cursorRaw) {
      try {
        const decoded = JSON.parse(Buffer.from(cursorRaw, 'base64').toString('utf8'));
        if (supportsPublishedAt && decoded.publishedAt && decoded.id) {
          cursor = { publishedAt: new Date(decoded.publishedAt), id: decoded.id };
        } else if (!supportsPublishedAt && decoded.createdAt && decoded.id) {
          cursor = { createdAt: new Date(decoded.createdAt), id: decoded.id };
        }
      } catch {
        // ignore invalid cursor
      }
    }

    const take = limit + 1;
    const orderBy = supportsPublishedAt
      ? [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { updatedAt: 'desc' },
          { id: 'desc' },
        ]
      : [{ createdAt: 'desc' }, { id: 'desc' }];
    const where = buildPublicFeedListWhere({ suburb: suburbRaw });

    // Fetch extra rows when filtering by category so we have enough after in-memory keyword filter (no fallback to all stores)
    const takeDb = categoryRaw ? Math.min(take * 4, 100) : take;

    const listArgs = cursor
      ? { where, orderBy, cursor, skip: 1, take: takeDb }
      : { where, orderBy, take: takeDb };

    let businesses = await findPublicBusinesses(prisma, listArgs);

    if (suburbRaw) {
      businesses = businesses.filter((business) => businessMatchesSuburbFilter(business, suburbRaw));
    }

    if (categoryRaw) {
      businesses = await filterBusinessesForFeedCategory(prisma, businesses, categoryRaw);
      businesses = businesses.slice(0, take);
    }

    businesses = businesses.filter(isPublicFeedEligibleBusiness);

    const hasMore = businesses.length > limit;
    const pageBusinesses = hasMore ? businesses.slice(0, limit) : businesses;
    const resolved = await resolvePublicStoresForList(prisma, pageBusinesses, {
      route: 'GET /api/public/stores/feed',
      req,
    });
    const feedItems = assemblePublicFeedItems(
      resolved.map((row, rank) =>
        publicStoreResultToFeedItem(row, { source: 'public_stores_feed', rank }),
      ),
    );
    logPublicFeedAssembly(feedItems, { route: 'GET /api/public/stores/feed' });
    let items = feedItems.map(({ store }) => store);
    items = await attachStoreEngagementToPublicStores(prisma, items, req);
    const last = items[items.length - 1];
    let nextCursor = null;
    if (hasMore && last) {
      const lastBusiness = businesses[limit - 1];
      nextCursor = Buffer.from(
        JSON.stringify(
          supportsPublishedAt
            ? {
                publishedAt:
                  lastBusiness.publishedAt?.toISOString?.() ??
                  lastBusiness.updatedAt?.toISOString?.() ??
                  lastBusiness.createdAt.toISOString(),
                id: lastBusiness.id,
              }
            : {
                createdAt: lastBusiness.createdAt.toISOString(),
                id: lastBusiness.id,
              },
        ),
      ).toString('base64');
    }

    res.json({
      ok: true,
      items,
      nextCursor,
    });
  } catch (error) {
    console.error('[PublicStores] Feed error:', error);
    next(error);
  }
});

/**
 * GET /api/public/stores/suburbs
 * Distinct suburbs with eligible public feed store counts (no auth).
 *
 * Query: category (optional: food|products|services)
 * Response: { ok: true, suburbs: [{ suburb, count }] }
 */
router.get('/stores/suburbs', optionalAuth, async (req, res, next) => {
  try {
    const categoryRaw = parseFeedCategoryQuery(req.query.category);
    let businesses = await findPublicBusinesses(prisma, {
      where: {
        ...publicStoreListWhere(),
        ...(hasBusinessColumn('suburb') ? { suburb: { not: null } } : {}),
      },
    });
    businesses = businesses.filter(isPublicFeedEligibleBusiness);
    if (categoryRaw) {
      businesses = await filterBusinessesForFeedCategory(prisma, businesses, categoryRaw);
    }
    res.json({
      ok: true,
      suburbs: aggregatePublicStoreSuburbs(businesses),
    });
  } catch (error) {
    console.error('[PublicStores] Suburbs error:', error);
    next(error);
  }
});

/**
 * GET /api/public/stores/category-counts
 * Published store counts per feed category lane (no auth).
 *
 * Query: suburb (optional — scopes counts to one suburb)
 * Response: { ok: true, counts: { food, products, services, offers, others } }
 */
router.get('/stores/category-counts', optionalAuth, async (req, res, next) => {
  try {
    const suburbRaw = parseFeedSuburbQuery(req.query.suburb);
    let businesses = await findPublicBusinesses(prisma, {
      where: buildPublicFeedListWhere({ suburb: suburbRaw }),
    });
    businesses = businesses.filter(isPublicFeedEligibleBusiness);
    if (suburbRaw) {
      businesses = businesses.filter((business) => businessMatchesSuburbFilter(business, suburbRaw));
    }

    const businessIds = businesses.map((b) => b.id).filter(Boolean);
    const [foodStores, productStores, serviceStores, promoByStore] = await Promise.all([
      filterBusinessesForFeedCategory(prisma, businesses, 'food'),
      filterBusinessesForFeedCategory(prisma, businesses, 'products'),
      filterBusinessesForFeedCategory(prisma, businesses, 'services'),
      loadActiveFeedPromoArtifacts(prisma, businessIds),
    ]);

    let offersCount = 0;
    for (const business of businesses) {
      const promos = promoByStore.get(business.id);
      if (Array.isArray(promos) && promos.length > 0) offersCount += 1;
    }

    res.json({
      ok: true,
      counts: {
        food: foodStores.length,
        products: productStores.length,
        services: serviceStores.length,
        offers: offersCount,
        others: 0,
      },
    });
  } catch (error) {
    console.error('[PublicStores] Category counts error:', error);
    next(error);
  }
});

/**
 * GET /api/public/stores/collections
 * Curated editorial collections with live store counts (no auth).
 *
 * Query: suburb (optional — scopes the pool before counting, e.g. active suburb pill)
 * Response: { ok: true, collections: [{ id, title, subtitle, emoji, count, filters }] }
 */
router.get('/stores/collections', optionalAuth, async (req, res, next) => {
  try {
    const suburbRaw = parseFeedSuburbQuery(req.query.suburb);
    const collections = await resolveCuratedCollections(prisma, { suburb: suburbRaw });
    res.json({ ok: true, collections });
  } catch (error) {
    console.error('[PublicStores] Collections error:', error);
    next(error);
  }
});

/**
 * GET /api/public/stores
 * List all active public stores (lightweight, no products)
 * 
 * No authentication required
 * 
 * Response (200):
 *   - ok: true
 *   - stores: Array of PublicStore (without products)
 */
router.get('/stores', async (req, res, next) => {
  try {
    // Find all active stores (no products for list view - lightweight)
    const stores = await findPublicBusinesses(prisma, {
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { region: true },
    });

    const eligibleStores = stores.filter(isPublicFeedEligibleBusiness);
    const resolved = await resolvePublicStoresForList(prisma, eligibleStores, {
      route: 'GET /api/public/stores',
      req,
    });
    const publicStores = resolved.map(({ store }) => store);

    res.json({
      ok: true,
      stores: publicStores
    });
  } catch (error) {
    console.error('[PublicStores] Error listing stores:', error);
    next(error);
  }
});

/**
 * GET /api/public/store/:id/draft
 * Public draft by store id (or "temp" + generationRunId). No auth.
 * Used when unauthenticated and in draft mode (storeId can be "temp").
 *
 * Query: generationRunId (required when id is "temp")
 * Response: { ok, status, draftId, generationRunId, store, products, categories, draftFound }
 */
router.get('/store/:id/draft', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { generationRunId } = req.query;
    const runId = (typeof generationRunId === 'string' && generationRunId) ? generationRunId : null;

    const empty = () => ({
      ok: true,
      status: 'generating',
      draftId: '',
      generationRunId: runId,
      store: { id: id || 'temp', name: 'Untitled Store', type: 'General' },
      products: [],
      categories: [],
      draftFound: false,
    });

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid id', message: 'id is required' });
    }

    if (id === 'temp') {
      if (!runId) {
        return res.json(empty());
      }
      const drafts = await prisma.draftStore.findMany({
        where: { status: { in: ['draft', 'generating', 'ready', 'error'] } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      const d = drafts.find((x) => {
        try {
          const inp = typeof x.input === 'string' ? JSON.parse(x.input) : (x.input || {});
          if (inp.generationRunId === runId) return true;
          const prev = typeof x.preview === 'string' ? JSON.parse(x.preview) : (x.preview || {});
          if (prev?.meta?.generationRunId === runId) return true;
          return false;
        } catch (_) { return false; }
      });
      if (!d) {
        return res.json(empty());
      }
      const input = typeof d.input === 'string' ? JSON.parse(d.input) : (d.input || {});
      const preview = typeof d.preview === 'string' ? JSON.parse(d.preview) : (d.preview || {});
      const storeObj = {
        id: 'temp',
        name: preview.storeName || preview.meta?.storeName || 'Untitled Store',
        type: preview.storeType || preview.meta?.storeType || 'General',
      };
      return res.json({
        ok: true,
        status: d.status,
        draftId: d.id,
        generationRunId: input.generationRunId || runId,
        store: storeObj,
        products: preview.items || preview.products || [],
        categories: preview.categories || [],
        draftFound: true,
      });
    }

    // Real store id: find draft by committedStoreId or preview.meta.storeId
    const drafts = await prisma.draftStore.findMany({
      where: {
        status: { in: ['draft', 'generating', 'ready', 'error'] },
        OR: [
          { committedStoreId: id },
          { committedStoreId: null }, // may have preview.meta.storeId
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    const d = drafts.find((x) => {
      if (x.committedStoreId === id) return true;
      try {
        const prev = typeof x.preview === 'string' ? JSON.parse(x.preview) : (x.preview || {});
        if (prev?.meta?.storeId === id) return true;
        return false;
      } catch (_) { return false; }
    });
    if (!d) {
      return res.json({ ...empty(), store: { id, name: 'Untitled Store', type: 'General' } });
    }
    const input = typeof d.input === 'string' ? JSON.parse(d.input) : (d.input || {});
    const preview = typeof d.preview === 'string' ? JSON.parse(d.preview) : (d.preview || {});
    const storeObj = {
      id,
      name: preview.storeName || preview.meta?.storeName || 'Untitled Store',
      type: preview.storeType || preview.meta?.storeType || 'General',
    };
    return res.json({
      ok: true,
      status: d.status,
      draftId: d.id,
      generationRunId: input.generationRunId || null,
      store: storeObj,
      products: preview.items || preview.products || [],
      categories: preview.categories || [],
      draftFound: true,
    });
  } catch (error) {
    console.error('[PublicUsers] GET /store/:id/draft error:', error);
    next(error);
  }
});

/**
 * GET /api/public/profile/:slug
 * Public personal-presence card data (no auth). Only for stores linked as a user's personal presence.
 */
router.get('/profile/:slug', async (req, res, next) => {
  try {
    const raw = (req.params.slug || '').trim();
    if (!raw) {
      return res.status(400).json({ ok: false, error: 'Invalid slug', message: 'Slug is required' });
    }
    const normalizedSlug = raw.toLowerCase();

    const business = await findPublicBusinessByUnique(prisma, {
      where: { slug: normalizedSlug },
    });

    if (!business || !business.isActive) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Not found' });
    }

    const { projection } = await getPublishedBusinessArtifact(prisma, {
      slug: normalizedSlug,
      businessId: business.id,
    });

    const ownerUser = await prisma.user.findFirst({
      where: { personalPresenceStoreId: business.id },
      select: {
        displayName: true,
        fullName: true,
        profilePhoto: true,
        avatarUrl: true,
        bio: true,
        tagline: true,
        qrCodeUrl: true,
      },
    });

    if (!ownerUser) {
      return res.status(404).json({ ok: false, error: 'Not found', message: 'Not found' });
    }

    const displayName =
      (ownerUser.displayName && String(ownerUser.displayName).trim())
      || (ownerUser.fullName && String(ownerUser.fullName).trim())
      || business.name
      || 'Profile';
    const profilePhoto = ownerUser.profilePhoto || ownerUser.avatarUrl || null;
    const bio = ownerUser.bio || ownerUser.tagline || null;

    const heroFromProjection = projection?.hero
      ? projection.hero.videoUrl || projection.hero.imageUrl || projection.hero.posterUrl || null
      : null;

    return res.json({
      ok: true,
      displayName,
      profilePhoto,
      bio,
      qrCodeUrl: ownerUser.qrCodeUrl || null,
      storeName: projection?.name ?? business.name,
      storeSlug: projection?.slug ?? business.slug,
      heroImage: heroFromProjection ?? business.heroImageUrl ?? null,
      businessId: business.id,
    });
  } catch (error) {
    console.error('[PublicProfile] GET /profile/:slug error:', error);
    next(error);
  }
});

/**
 * GET /api/public/stores/:slug/related
 * Category-relevant Related on Cardbey recommendations (deterministic ranking).
 *
 * Query: limit (default 8, max 24), diagnostics=1 (dev ranking reasons)
 */
router.get('/stores/:slug/related', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 24) : 8;
    const diagnostics =
      String(req.query.diagnostics ?? '') === '1' ||
      String(process.env.NODE_ENV || '') === 'development';

    const result = await getRelatedBusinessesForSlug(prisma, slug, { limit, diagnostics });
    if (!result.ok) {
      const status = result.error === 'store_not_found' ? 404 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[PublicStores] GET /stores/:slug/related error:', error);
    next(error);
  }
});

/**
 * GET /api/public/stores/:slug/products
 * Paginated published products for a public store (optional categoryId filter).
 *
 * Query: categoryId?, limit (default 50, max 300), offset (default 0), lang?
 */
router.get('/stores/:slug/products', async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid slug',
        message: 'Slug is required',
      });
    }

    const normalizedSlug = slug.toLowerCase().trim();
    const store = await prisma.business.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true, slug: true, isActive: true },
    });

    if (!store || !store.isActive) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
        message: 'Store not found',
      });
    }

    const { limit, offset } = parseProductPagination(req.query.limit, req.query.offset);
    const categoryId =
      typeof req.query.categoryId === 'string' && req.query.categoryId.trim()
        ? req.query.categoryId.trim()
        : null;
    const lang = typeof req.query.lang === 'string' ? req.query.lang.trim() : undefined;

    const result = await listStoreProducts(prisma, {
      businessId: store.id,
      publishedOnly: true,
      categoryId,
      limit,
      offset,
      lang,
    });

    return res.json({
      ok: true,
      storeId: store.id,
      slug: store.slug,
      ...result,
    });
  } catch (error) {
    console.error('[PublicStores] GET /stores/:slug/products error:', error);
    next(error);
  }
});

/**
 * GET /api/public/stores/:slug
 * Get public store profile by slug with published products
 * 
 * No authentication required
 * 
 * Response (200):
 *   - ok: true
 *   - store: PublicStore (with products array)
 * 
 * Errors:
 *   - 404: Store not found or not active
 */
router.get('/stores/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    console.log(`[PublicStores] Fetching store for slug: "${slug}"`);

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid slug',
        message: 'Slug is required'
      });
    }

    // Normalize slug to lowercase for case-insensitive lookup
    const normalizedSlug = slug.toLowerCase().trim();

    // Find store by slug with published products
    const store = await prisma.business.findUnique({
      where: { slug: normalizedSlug },
      include: {
        products: {
          where: { isPublished: true }, // Only published products
          orderBy: [
            { category: 'asc' },
            { name: 'asc' }
          ]
        },
        user: {
          select: {
            personalPresenceStore: { select: { slug: true } },
          },
        },
        businessBillingProfile: true,
      }
    });

    if (!store) {
      console.log(`[PublicStores] Store not found for slug: "${normalizedSlug}"`);
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
        message: 'Store not found'
      });
    }

    if (isGhostStoreRemoved(store)) {
      return res.status(410).json({
        ok: false,
        error: 'store_removed',
        message: 'This page is no longer available.',
        removed: true,
      });
    }

    // Only return active, publicly eligible stores
    if (!store.isActive || !isPublicFeedEligibleBusiness(store)) {
      console.log(`[PublicStores] Store ${store.id} is not publicly visible`);
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
        message: 'Store not found'
      });
    }

    console.log(`[PublicStores] Found store: ${store.id} (${store.name}) with slug: "${store.slug}", products: ${store.products?.length || 0}`);

    const { store: publicStore, usedFallback, projection } = await resolvePublicStoreFromArtifact(prisma, store);

    let projectionHeroRow = null;
    try {
      projectionHeroRow = await prisma.publishedArtifactProjection.findUnique({
        where: { businessId: store.id },
        select: { heroVideoUrl: true, heroMediaType: true },
      });
    } catch {
      projectionHeroRow = null;
    }
    if (projectionHeroRow) {
      // DANH: fix-hero-video-publish
      if (projectionHeroRow.heroVideoUrl) {
        publicStore.heroVideoUrl = projectionHeroRow.heroVideoUrl;
        publicStore.heroVideo = projectionHeroRow.heroVideoUrl;
        publicStore.heroUrl = projectionHeroRow.heroVideoUrl;
        publicStore.bannerUrl = projectionHeroRow.heroVideoUrl;
      }
      publicStore.heroMediaType = projectionHeroRow.heroMediaType ?? publicStore.heroMediaType ?? 'image';
    }

    Object.assign(
      publicStore,
      resolvePublicStoreMediaUrls(
        enrichStoreHeroVideoUrls(publicStore, {
          uploadsDir: process.env.UPLOADS_DIR,
        }),
        req,
      ),
    );

    // Hotlinked stock videos (e.g. Pexels) often send Content-Disposition: attachment,
    // which breaks iOS Safari inline playback. Serve via Cardbey caching proxy instead.
    const absolutize = (p) => {
      if (!p) return p;
      if (/^https?:\/\//i.test(p)) return p;
      const base = getBaseUrlFromRequest(req).replace(/\/$/, '');
      return `${base}${p.startsWith('/') ? p : `/${p}`}`;
    };
    for (const key of ['heroVideoUrl', 'heroVideo', 'heroUrl', 'bannerUrl', 'heroVideoUrlOriginal']) {
      const cur = publicStore[key];
      if (typeof cur === 'string' && needsDurableHeroVideoIngest(cur)) {
        publicStore[key] = rewriteHotlinkHeroVideoForPlayback(cur, absolutize);
      }
    }

    // Always emit socialLinks on slug route (parity with frontscreen card mapping).
    const mappedSocialLinks =
      publicStore.socialLinks ??
      parseSocialLinks(projection?.content?.socialLinks) ??
      parseSocialLinks(store.socialLinks) ??
      null;
    publicStore.socialLinks = mappedSocialLinks;

    console.log('[PUBLIC_STORE_SOCIAL]', {
      businessSocialLinks: store?.socialLinks,
      projectionSocialLinks: projection?.content?.socialLinks ?? null,
      mappedSocialLinks: publicStore?.socialLinks,
      usedFallback,
    });

    console.log('[PUBLIC_ROUTE_RESOLVE]', {
      slug: store.slug,
      storeId: store.id,
      name: publicStore.name,
      tagline: publicStore.tagline,
      description: publicStore.description,
      heroUrl: publicStore.heroUrl,
      heroVideo: publicStore.heroVideo ?? null,
      websiteSections: publicStore.website?.sections?.length ?? 0,
      projectionFallback: usedFallback,
    });

    /** Editable draft lineage for owner "Edit website" — always scoped to this slug's business row. */
    const latestDraft = await prisma.draftStore.findFirst({
      where: {
        committedStoreId: store.id,
        status: { in: ['draft', 'generating', 'ready', 'committed', 'error'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, input: true },
    });
    if (latestDraft?.id) {
      publicStore.currentDraftId = String(latestDraft.id);
      try {
        const inp =
          typeof latestDraft.input === 'string'
            ? JSON.parse(latestDraft.input)
            : latestDraft.input && typeof latestDraft.input === 'object'
              ? latestDraft.input
              : {};
        const runId = inp?.generationRunId;
        if (typeof runId === 'string' && runId.trim()) {
          publicStore.generationRunId = runId.trim();
        }
      } catch {
        /* ignore */
      }
    }

    /** Personal presence stores: owner links via User.personalPresenceStoreId — drives profile-card public layout. */
    const personalPresenceOwner = await prisma.user.findFirst({
      where: { personalPresenceStoreId: store.id },
      select: { id: true },
    });
    if (personalPresenceOwner) {
      publicStore.preview = {
        meta: {
          template: 'personal_presence',
          layoutHint: 'profile_card',
        },
      };
    }

    const webBase = publicWebBase();
    if (publicStore.slug) {
      publicStore.storeUrl = `${webBase}/s/${encodeURIComponent(publicStore.slug)}`;
    }

    const ingestionContext = parseDocumentIngestionContext(store.storefrontSettings);
    if (ingestionContext) {
      publicStore.documentContext = ingestionContext;
    }

    res.json({
      ok: true,
      store: publicStore
    });
  } catch (error) {
    console.error('[PublicStores] Error fetching public store:', error);
    next(error);
  }
});

export default router;

