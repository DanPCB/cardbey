/**
 * Public Users Routes
 * Public profile endpoints (no authentication required)
 */

import { Router } from 'express';
import { toPublicUserProfile } from '../utils/publicProfileMapper.js';
import { resolvePublicStoreFromArtifact } from '../services/publishedArtifactProjection/getPublishedBusinessArtifact.js';
import { enrichStoreHeroVideoUrls } from '../lib/videoIosSafe.js';
import { resolvePublicStoreMediaUrls } from '../utils/publicUrl.js';
import { resolvePublicStoresForList } from '../services/publishedArtifactProjection/resolvePublicStoreList.js';
import {
  findPublicBusinesses,
  findPublicBusinessByUnique,
  publicStoreListWhere,
} from '../services/publishedArtifactProjection/findPublicBusinesses.js';
import { getPublishedBusinessArtifact } from '../services/publishedArtifactProjection/getPublishedBusinessArtifact.js';
import { publicWebBase } from '../utils/publicWebBase.js';
import { parseSocialLinks } from '../lib/socialLinks.js';
import { listStoreProducts, parseProductPagination } from '../lib/listStoreProducts.js';
import { parseDocumentIngestionContext } from '../lib/documentIngestion/documentAwareConcierge.js';

import { prisma } from '../lib/prisma.js';
import { isGhostStoreRemoved, isPublicFeedEligibleBusiness } from '../utils/publicStoreVisibility.js';

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
  ],
};

function businessTypeMatchesCategory(businessType, category) {
  const t = (businessType ?? '').toLowerCase().trim();
  if (!category || !t) return true;
  const keywords = FEED_CATEGORY_KEYWORDS[category];
  if (!keywords) return true;
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

/**
 * GET /api/public/stores/feed
 * Paginated feed of active public stores (for reels/frontscreen).
 * No authentication required.
 *
 * Query: limit (default 10), cursor (opaque), category (optional: food|products|services)
 * Order: createdAt DESC, id DESC (tie-break)
 * Response: { items: PublicStore[], nextCursor: string | null }
 */
router.get('/stores/feed', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 50);
    const cursorRaw = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const categoryRaw = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : null;
    let cursor = null;
    if (cursorRaw) {
      try {
        const decoded = JSON.parse(Buffer.from(cursorRaw, 'base64').toString('utf8'));
        if (decoded.createdAt && decoded.id) {
          cursor = { createdAt: new Date(decoded.createdAt), id: decoded.id };
        }
      } catch {
        // ignore invalid cursor
      }
    }

    const take = limit + 1;
    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
    const where = publicStoreListWhere();

    // Fetch extra rows when filtering by category so we have enough after in-memory keyword filter (no fallback to all stores)
    const takeDb = categoryRaw && FEED_CATEGORY_KEYWORDS[categoryRaw] ? Math.min(take * 4, 100) : take;

    const listArgs = cursor
      ? { where, orderBy, cursor, skip: 1, take: takeDb }
      : { where, orderBy, take: takeDb };

    let businesses = await findPublicBusinesses(prisma, listArgs);

    if (categoryRaw && FEED_CATEGORY_KEYWORDS[categoryRaw]) {
      businesses = businesses.filter((b) => businessTypeMatchesCategory(b.type, categoryRaw));
      businesses = businesses.slice(0, take);
    }

    businesses = businesses.filter(isPublicFeedEligibleBusiness);

    const hasMore = businesses.length > limit;
    const pageBusinesses = hasMore ? businesses.slice(0, limit) : businesses;
    const resolved = await resolvePublicStoresForList(prisma, pageBusinesses, {
      route: 'GET /api/public/stores/feed',
      req,
    });
    const items = resolved.map(({ store }) => store);
    const last = items[items.length - 1];
    let nextCursor = null;
    if (hasMore && last) {
      const lastBusiness = businesses[limit - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          createdAt: lastBusiness.createdAt.toISOString(),
          id: lastBusiness.id,
        })
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

