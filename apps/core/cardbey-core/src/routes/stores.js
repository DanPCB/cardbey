/**
 * Store Routes
 * POST /api/stores - Create a new store
 * GET /api/stores - Get user's stores
 * GET /api/stores/:id - Get a specific store
 * PATCH /api/stores/:id - Update a store
 * POST /api/stores/:storeId/upload/hero | upload/avatar - Upload and persist to draft preview
 * PATCH /api/stores/:storeId/draft/hero | draft/avatar - Set hero/avatar by URL
 */

import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, requireOwner, optionalAuth } from '../middleware/auth.js';
import { generateUniqueStoreSlug, slugify } from '../utils/slug.js';
import { resolveDraftForStore } from '../lib/draftResolver.js';
import { getDraftByGenerationRunId, getDraft, autoCategorizeDraft, detectStoreImageMismatch, patchDraftPreview } from '../services/draftStore/draftStoreService.js';
import { publishDraft, PublishDraftError } from '../services/draftStore/publishDraftService.js';
import { isDraftOwnedByUser } from '../lib/draftOwnership.js';
import { getOrCreateMission } from '../lib/mission.js';
import { getTenantId } from '../lib/tenant.js';
import { createAgentRun } from '../lib/agentRun.js';
import { executeAgentRunInProcess } from '../lib/agentRunExecutor.js';
import { uploadBufferToS3 } from '../lib/s3Client.js';
import { toPublicStore } from '../utils/publicStoreMapper.js';
import { normalizeMediaUrlForStorage } from '../utils/publicUrl.js';

const router = express.Router();

/** Check if user has a given role. Handles role (string), roles (array or JSON string), or roles as objects [{ name }]. */
function hasRole(user, role) {
  if (!user || !role) return false;
  if (typeof user.role === 'string' && user.role === role) return true;
  let roles = user.roles;
  if (typeof roles === 'string') {
    try {
      roles = JSON.parse(roles);
    } catch {
      return false;
    }
  }
  if (Array.isArray(roles)) {
    if (roles.some((r) => r === role)) return true;
    if (roles.some((r) => r && typeof r === 'object' && r.name === role)) return true;
  }
  return false;
}

/** In-memory set to log "draft missing" only once per generationRunId (dev), avoid log spam on poll */
const loggedMissingDraftRunIds = new Set();
const prisma = new PrismaClient();

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const OwnerProfileVisibilitySchema = z.object({
  showOwnerProfile: z.boolean(),
});

/** Multer for store draft asset uploads: memory, field "file", image allowlist, 10MB max */
const storeAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed (jpeg, png, webp, gif)'), false);
    }
  },
});

/**
 * Resolve draft for storeId (and generationRunId when storeId === "temp"). Enforces ownership.
 * Returns { draft } or { errorResponse: { status, body } } for the route to send.
 */
async function resolveDraftForStoreAsset(req) {
  const storeId = req.params.storeId;
  const generationRunId = (typeof req.query.generationRunId === 'string' ? req.query.generationRunId.trim() : null)
    || (typeof req.body?.generationRunId === 'string' ? req.body.generationRunId.trim() : null);
  const userId = req.userId;
  if (!userId) {
    return { errorResponse: { status: 401, body: { ok: false, error: 'unauthorized', message: 'Authentication required' } } };
  }
  if (storeId === 'temp') {
    if (!generationRunId) {
      return { errorResponse: { status: 400, body: { ok: false, error: 'generationRunId_required', message: 'Query generationRunId required when storeId is temp' } } };
    }
    const allowed = await isDraftOwnedByUser(generationRunId, userId);
    if (!allowed) {
      return { errorResponse: { status: 403, body: { ok: false, error: 'forbidden', message: 'You do not have access to this draft.' } } };
    }
    const draft = await getDraftByGenerationRunId(generationRunId);
    if (!draft) {
      return { errorResponse: { status: 404, body: { ok: false, error: 'draft_not_found', message: 'Draft not found' } } };
    }
    return { draft };
  }
  const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
  if (!resolved.draft) {
    return { errorResponse: { status: 404, body: { ok: false, error: 'draft_not_found', message: 'Draft not found' } } };
  }
  const business = await prisma.business.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!business || business.userId !== userId) {
    return { errorResponse: { status: 403, body: { ok: false, error: 'forbidden', message: 'You do not have access to this store.' } } };
  }
  return { draft: resolved.draft };
}

/**
 * POST /api/stores
 * Create a new store
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Request body:
 *   - name: string (required)
 *   - creationMethod?: 'manual' | 'ai' | 'ocr' | 'library' (default: 'manual')
 * 
 * Response (201):
 *   - ok: true
 *   - store: Store object
 * 
 * Errors:
 *   - 400: Missing or invalid store name
 *   - 401: Not authenticated
 *   - 409: User already has a store
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, creationMethod = 'manual' } = req.body ?? {};

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ 
        ok: false,
        error: 'Store name is required',
        message: 'Store name is required'
      });
    }

    // Validate creationMethod if provided
    const validCreationMethods = ['manual', 'ai', 'ocr', 'library'];
    if (creationMethod && !validCreationMethods.includes(creationMethod)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid creation method',
        message: `Creation method must be one of: ${validCreationMethods.join(', ')}`
      });
    }

    const storeName = name.trim();

    // Multi-store support: users can have multiple stores
    // No need to check for existing stores

    // Generate unique slug
    const slug = await generateUniqueStoreSlug(prisma, storeName);

    // Determine creation origin from creationMethod
    let creationOrigin = 'dashboard';
    if (creationMethod === 'ai' || creationMethod === 'ocr') {
      creationOrigin = 'quick_start';
    } else if (creationMethod === 'library') {
      creationOrigin = 'template';
    }
    
    // Create store with metadata in stylePreferences (temporary until meta field is added)
    const metadata = {
      creationOrigin,
      lifecycleStage: 'configuring',
      createdAt: new Date().toISOString()
    };
    
    const store = await prisma.business.create({
      data: {
        userId: req.userId,
        name: storeName,
        type: 'General', // Default type
        slug,
        description: null,
        logo: null,
        region: null,
        isActive: false, // Start as inactive until onboarding is complete
        stylePreferences: metadata // Store metadata temporarily in stylePreferences
      }
    });

    // Update user's hasBusiness flag
    await prisma.user.update({
      where: { id: req.userId },
      data: { hasBusiness: true }
    });

    console.log(`[Stores] ✅ Store created: ${store.slug} by user ${req.userId}`);

    res.status(201).json({
      ok: true,
      store
    });
  } catch (error) {
    console.error('[Stores] Create error:', error);
    next(error);
  }
});

/**
 * GET /api/stores
 * Get user's stores
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Response (200):
 *   - ok: true
 *   - stores: Array of Store objects
 * 
 * Errors:
 *   - 401: Not authenticated
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const stores = await prisma.business.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      ok: true,
      stores
    });
  } catch (error) {
    console.error('[Stores] List error:', error);
    next(error);
  }
});

/**
 * Build store context JSON. Use when store exists (full) or when store is missing (minimal, store: null).
 * Always returns 200-style shape: { ok, storeId, tenantId, store, source, ... }.
 * @param {Object} options - Optional. isOwner: boolean (default true) for public/preview views.
 */
function buildStoreContextPayload(business, storeId, tenantId, source, options = {}) {
  if (!business) {
    return {
      ok: true,
      storeId: storeId || 'temp',
      tenantId: tenantId != null ? tenantId : 'missing',
      store: null,
      source: source || 'auth',
    };
  }
  let meta = {};
  if (business.stylePreferences && typeof business.stylePreferences === 'object') {
    meta = business.stylePreferences;
  } else if (typeof business.stylePreferences === 'string') {
    try {
      meta = JSON.parse(business.stylePreferences);
    } catch {
      meta = {};
    }
  }
  const creationOrigin = meta.creationOrigin || null;
  const lifecycleStage = meta.lifecycleStage || (business.isActive ? 'live' : 'configuring');
  let requiredNextStep = null;
  if (lifecycleStage === 'generated') requiredNextStep = 'complete_onboarding';
  else if (lifecycleStage === 'configuring') requiredNextStep = 'continue_setup';
  const isOwner = options.isOwner !== undefined ? options.isOwner : true;
  return {
    ok: true,
    storeId: business.id,
    businessId: business.id,
    tenantId: tenantId != null ? tenantId : (business.userId != null ? business.userId : 'missing'),
    creationOrigin,
    lifecycleStage,
    requiredNextStep,
    isOwner,
    store: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      isActive: business.isActive,
    },
    source: source || 'db',
  };
}

/** Fields needed for store context payload only; omit heroImageUrl/avatarImageUrl so DB without those columns does not 500. */
const STORE_CONTEXT_SELECT = {
  id: true,
  userId: true,
  name: true,
  slug: true,
  isActive: true,
  stylePreferences: true,
};

/**
 * GET /api/store/context
 * Get store context for current user (most recent/active store).
 * Returns 200 even when no store: storeId='temp', store=null (Content Studio / creative-shell).
 *
 * Query params:
 *   - businessId: Optional business ID to get context for specific business
 */
router.get('/context', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.userId || (req.user && req.user.id) || 'missing';
    const { businessId } = req.query;

    let business = null;
    if (businessId) {
      business = await prisma.business.findUnique({
        where: { id: String(businessId) },
        select: STORE_CONTEXT_SELECT,
      }).catch(() => null);
      if (business) {
        const isDevAdmin = process.env.NODE_ENV !== 'production' && req.user && req.user.isDevAdmin === true;
        if (!isDevAdmin && business.userId !== req.userId) {
          return res.status(403).json({
            ok: false,
            error: 'Access denied',
          });
        }
      }
    } else {
      business = await prisma.business.findFirst({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        select: STORE_CONTEXT_SELECT,
      }).catch(() => null);
    }

    const storeId = (business && business.id) || 'temp';
    if (process.env.NODE_ENV !== 'production') {
      console.log('[store/context]', { storeId, tenantId });
    }
    res.json(buildStoreContextPayload(business, storeId, tenantId, 'auth'));
  } catch (error) {
    console.error('[Stores] Context error:', error);
    next(error);
  }
});

/**
 * GET /api/store/:id/context
 * Get store context for a specific store ID.
 * Returns 200 even when storeId is 'temp' or store row doesn't exist (store: null).
 * Owner always allowed; for published stores (isActive) any user can read context (e.g. preview page).
 */
router.get('/:id/context', optionalAuth, async (req, res, next) => {
  try {
    const storeId = req.params.id != null ? req.params.id : (req.query.storeId != null ? req.query.storeId : 'temp');
    const tenantId = req.userId || (req.user && req.user.id) || 'missing';

    let business = null;
    let isOwner = false;
    if (storeId !== 'temp') {
      business = await prisma.business.findUnique({
        where: { id: storeId },
        select: STORE_CONTEXT_SELECT,
      }).catch(() => null);
      if (business) {
        const isDevAdmin = process.env.NODE_ENV !== 'production' && req.user && req.user.isDevAdmin === true;
        isOwner = isDevAdmin || (req.userId != null && business.userId === req.userId);
        if (!isOwner && !business.isActive) {
          return res.status(403).json({
            ok: false,
            error: 'Access denied',
          });
        }
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[store/context]', { storeId, tenantId });
    }
    res.json(buildStoreContextPayload(business, storeId, tenantId, 'params', { isOwner }));
  } catch (error) {
    console.error('[Stores] Context error:', error);
    next(error);
  }
});

/**
 * GET /api/store/:id/preview
 * Public storefront preview (no auth). Returns store basics + hero/avatar + categories + items for StorePreviewPage.
 * 404 when store not found or not active.
 */
router.get('/:id/preview', async (req, res, next) => {
  try {
    const storeId = req.params.id;
    if (!storeId || storeId === 'temp') {
      return res.status(404).json({ ok: false, error: 'store_not_found', message: 'Store not found' });
    }
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        type: true,
        slug: true,
        description: true,
        tagline: true,
        heroText: true,
        logo: true,
        heroImageUrl: true,
        avatarImageUrl: true,
        stylePreferences: true,
        storefrontSettings: true,
        primaryColor: true,
        secondaryColor: true,
        isActive: true,
        products: {
          where: { isPublished: true, deletedAt: null },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
          select: { name: true, price: true, description: true, imageUrl: true, category: true },
        },
      },
    });
    if (!business || !business.isActive) {
      return res.status(404).json({ ok: false, error: 'store_not_found', message: 'Store not found' });
    }
    // Parse logo same as publicStoreMapper so public store page matches feed reels (avatarUrl + bannerUrl)
    let avatarUrl = null;
    let bannerUrl = null;
    if (business.logo) {
      try {
        const logoData = typeof business.logo === 'string' ? JSON.parse(business.logo) : business.logo;
        avatarUrl = logoData?.avatarUrl ?? logoData?.url ?? null;
        bannerUrl = logoData?.bannerUrl ?? logoData?.heroUrl ?? logoData?.coverUrl ?? null;
      } catch {
        avatarUrl = business.logo;
      }
    }
    const images = (bannerUrl || avatarUrl) ? [bannerUrl, avatarUrl].filter(Boolean) : [];
    const categoryNames = [...new Set(business.products.map((p) => (p.category && String(p.category).trim()) || null).filter(Boolean))];
    const catKey = (name) => (name && slugify(String(name).trim())) || 'other';
    const categories = categoryNames.length
      ? categoryNames.map((name) => ({ id: catKey(name), name: String(name).trim() }))
      : [{ id: 'other', name: 'Other' }];
    if (!categories.some((c) => c.id === 'other')) {
      categories.push({ id: 'other', name: 'Other' });
    }
    const items = business.products.map((p) => {
      const catName = p.category ?? null;
      const categoryId = catKey(catName);
      return {
        name: p.name,
        price: p.price != null ? String(p.price) : null,
        description: p.description ?? null,
        imageUrl: p.imageUrl ?? null,
        category: catName,
        categoryId,
      };
    });
    // Hero/avatar: use persisted Business.heroImageUrl/avatarImageUrl first (same as editor) so public preview matches draft UI
    let stylePrefs = {};
    if (business.stylePreferences) {
      try {
        stylePrefs = typeof business.stylePreferences === 'object'
          ? business.stylePreferences
          : JSON.parse(business.stylePreferences);
      } catch {
        stylePrefs = {};
      }
    }
    const heroImageUrl = (business.heroImageUrl && String(business.heroImageUrl).trim()) ||
      (stylePrefs.heroImage && String(stylePrefs.heroImage).trim()) ||
      bannerUrl ||
      avatarUrl ||
      (items.length && items[0].imageUrl ? items[0].imageUrl : null);
    const resolvedAvatarUrl = (business.avatarImageUrl && String(business.avatarImageUrl).trim()) ||
      avatarUrl ||
      null;
    // Storefront view: defaultView "list"|"grid" (default "grid"), allowUserToggle (default true)
    let storefront = { defaultView: 'grid', allowUserToggle: true };
    if (business.storefrontSettings && typeof business.storefrontSettings === 'object') {
      const s = business.storefrontSettings;
      if (s.defaultView === 'list' || s.defaultView === 'grid') storefront.defaultView = s.defaultView;
      if (typeof s.allowUserToggle === 'boolean') storefront.allowUserToggle = s.allowUserToggle;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Stores:preview] storefront config', { storeId, storefront, hasStorefrontSettings: !!business.storefrontSettings });
    }

    const preview = {
      storeName: business.name,
      storeType: business.type || 'business',
      slogan: business.tagline ?? business.description ?? undefined,
      tagline: business.tagline ?? business.description ?? undefined,
      heroText: business.heroText ?? business.description ?? undefined,
      categories,
      items,
      images,
      heroImageUrl,
      avatarUrl: resolvedAvatarUrl,
      brandColors: {
        primary: business.primaryColor || '#6366f1',
        secondary: business.secondaryColor || '#8b5cf6',
      },
      storefront,
    };
    const publicDto = toPublicStore(business);
    const slugTrimmed = typeof business.slug === 'string' && business.slug.trim();
    const hasPublishedMiniWebsite = Boolean(
      slugTrimmed && publicDto.website != null && typeof publicDto.website === 'object',
    );
    res.json({
      ok: true,
      status: 'ready',
      mode: 'ai',
      preview,
      slug: business.slug || null,
      hasPublishedMiniWebsite,
    });
  } catch (error) {
    console.error('[Stores] Preview error:', error);
    next(error);
  }
});

/**
 * GET /api/store/:id/promotions
 * Public: list active promotions for storefront (e.g. entry popup). No auth.
 * Only promos where: isActive, startsAt <= now (or null), endsAt >= now (or null).
 * Optional displayMode filter when column exists (e.g. displayMode === 'popup').
 */
router.get('/:id/promotions', async (req, res, next) => {
  try {
    const storeId = req.params.id;
    if (!storeId || storeId === 'temp') {
      return res.status(404).json({ ok: false, error: 'store_not_found', message: 'Store not found' });
    }
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, isActive: true },
    });
    if (!business || !business.isActive) {
      return res.status(404).json({ ok: false, error: 'store_not_found', message: 'Store not found' });
    }
    const now = new Date();
    const promos = await prisma.storePromo.findMany({
      where: {
        storeId: business.id,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        heroImageUrl: true,
        ctaLabel: true,
        targetUrl: true,
        productId: true,
      },
    });
    const promotions = promos.map((p) => ({
      id: p.id,
      mediaUrl: (p.heroImageUrl && String(p.heroImageUrl).trim()) || null,
      message: (p.title && String(p.title).trim()) || (p.subtitle && String(p.subtitle).trim()) || null,
      ctaLabel: (p.ctaLabel && String(p.ctaLabel).trim()) || null,
      ctaUrl: (p.targetUrl && String(p.targetUrl).trim()) || null,
      productId: (p.productId && String(p.productId).trim()) || null,
    }));
    return res.json({ ok: true, promotions });
  } catch (error) {
    console.error('[Stores] promotions error:', error);
    next(error);
  }
});

/**
 * GET /api/stores/:storeId/draft
 * Get draft for a store. Stable response contract; payload shape unchanged.
 * Requires auth (401 if no token). For storeId "temp", draft must belong to authenticated user (403 if wrong tenant).
 * When storeId is not "temp": user must own store.
 * Always returns 200 on success. Status: 'generating' | 'ready' | 'not_found' | 'failed'.
 *
 * Query: generationRunId (optional, required when storeId is "temp")
 * Response: { ok: true, storeId, generationRunId, status, draftId, draft, store, products, categories }
 */
router.get('/:storeId/draft', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const generationRunId = typeof req.query.generationRunId === 'string' ? req.query.generationRunId : null;

    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid storeId',
        message: 'storeId is required'
      });
    }

    if (storeId === 'temp') {
      const runId = generationRunId && typeof generationRunId === 'string' ? generationRunId.trim() : null;
      if (!runId) {
        // Draft alias endpoint contract: never 404. When temp draft run id is unknown, return 200 not_found.
        return res.status(200).json({
          ok: true,
          storeId: 'temp',
          generationRunId: null,
          status: 'not_found',
          draftId: '',
          draft: null,
          store: { id: 'temp', name: 'Untitled Store', type: 'General', userId: req.userId },
          products: [],
          categories: [],
          qaReport: null,
        });
      }
      // Ownership: draft must belong to authenticated user, or was created by guest (allow after login); uses shared isDraftOwnedByUser
      if (runId) {
        const allowed = await isDraftOwnedByUser(runId, req.userId);
        if (!allowed) {
          return res.status(403).json({
            ok: false,
            error: 'forbidden',
            message: 'You do not have access to this draft.',
          });
        }
      }
      // When generationRunId is provided: use getDraftByGenerationRunId; never return fake "generating" when draft row does not exist
      if (runId) {
        let draft = null;
        try {
          draft = await getDraftByGenerationRunId(runId);
        } catch (_) {
          draft = null;
        }
        if (!draft) {
          let task = null;
          try {
            const tasks = await prisma.orchestratorTask.findMany({
              where: { status: { in: ['queued', 'running', 'completed', 'failed'] } },
              orderBy: { createdAt: 'desc' },
              take: 100,
            });
            task = tasks.find((t) => t.request && typeof t.request === 'object' && t.request.generationRunId === runId) || null;
          } catch (_) {
            task = null;
          }
          if (process.env.NODE_ENV === 'development' && !loggedMissingDraftRunIds.has(runId)) {
            loggedMissingDraftRunIds.add(runId);
            console.warn('[Stores:draft] draft missing', { generationRunId: runId, jobStatus: task?.status ?? null });
          }
          return res.status(200).json({
            ok: true,
            storeId: 'temp',
            generationRunId: runId,
            status: 'failed',
            error: 'draft_not_found',
            errorCode: 'STORE_NOT_FOUND',
            recommendedAction: 'startOver',
            draftId: '',
            draft: null,
            store: { id: 'temp', name: 'Untitled Store', type: 'General', userId: req.userId },
            products: [],
            categories: [],
            qaReport: null,
          });
        }
        const isExpired = draft.expiresAt && new Date() > new Date(draft.expiresAt);
        if (draft.status === 'failed' || isExpired) {
          return res.status(200).json({
            ok: true,
            storeId: 'temp',
            generationRunId: runId,
            status: 'failed',
            error: draft.error || 'draft_failed',
            errorCode: draft.errorCode || null,
            recommendedAction: draft.recommendedAction || null,
            draftId: String(draft.id),
            draft,
            store: { id: 'temp', name: 'Untitled Store', type: 'General', userId: req.userId },
            products: [],
            categories: [],
            qaReport: null,
          });
        }
        const preview = typeof draft.preview === 'string' ? JSON.parse(draft.preview) : (draft.preview || {});
        const input = typeof draft.input === 'string' ? JSON.parse(draft.input) : (draft.input || {});
        const products = (Array.isArray(preview.items) ? preview.items : []).map((item) => ({ ...item, description: item?.description ?? null }));
        const categories = Array.isArray(preview.categories) ? preview.categories : [];
        const status = draft.status === 'generating' ? 'generating' : (draft.status === 'ready' || draft.status === 'draft' ? 'ready' : 'not_found');
        let heroFromSections = null;
        if (Array.isArray(preview?.website?.sections)) {
          const hSec = preview.website.sections.find((s) => s && s.type === 'hero');
          const c = hSec?.content;
          if (c && typeof c === 'object') {
            const iu = c.imageUrl;
            const bi = c.backgroundImage;
            heroFromSections =
              (typeof iu === 'string' && iu.trim()) || (typeof bi === 'string' && bi.trim()) || null;
          }
        }
        const heroImageUrlTop =
          (preview?.hero?.imageUrl && String(preview.hero.imageUrl).trim()) ||
          (preview?.hero?.url && String(preview.hero.url).trim()) ||
          (typeof preview?.heroImageUrl === 'string' && preview.heroImageUrl.trim()) ||
          heroFromSections ||
          null;
        // Debug: log preview keys and hero/avatar URLs; regression guard: warn when ready but hero/avatar missing
        if (process.env.NODE_ENV === 'development' || process.env.LOG_DRAFT_PREVIEW === '1') {
          const previewKeys = typeof preview === 'object' && preview !== null ? Object.keys(preview) : [];
          const heroImageUrl = preview?.hero?.imageUrl ?? preview?.heroImageUrl ?? preview?.hero?.url ?? preview?.store?.heroImageUrl ?? null;
          const avatarUrl = preview?.avatar?.imageUrl ?? preview?.avatarImageUrl ?? preview?.avatar?.url ?? preview?.brand?.logoUrl ?? preview?.store?.profileAvatarUrl ?? null;
          console.log('[Stores:GET draft] preview returned', { draftId: String(draft.id), generationRunId: runId, previewKeys, heroImageUrl: heroImageUrl ? '(set)' : '(none)', avatarUrl: avatarUrl ? '(set)' : '(none)' });
          if (status === 'ready' && (!heroImageUrl || !avatarUrl)) {
            console.warn('[Stores:GET draft] regression guard: draft ready but hero/avatar missing', { generationRunId: runId, previewKeys, heroMissing: !heroImageUrl, avatarMissing: !avatarUrl });
          }
        }
        return res.status(200).json({
          ok: true,
          storeId: 'temp',
          generationRunId: input.generationRunId || runId,
          status,
          draftId: String(draft.id),
          draft,
          /** Canonical hero URL for dashboards that read top-level fields (matches preview.hero / heroImageUrl / website.sections hero). */
          heroImageUrl: heroImageUrlTop,
          store: {
            id: 'temp',
            name: preview.storeName || preview.meta?.storeName || 'Untitled Store',
            type: preview.storeType || preview.meta?.storeType || 'General',
            userId: req.userId,
          },
          products,
          categories,
          qaReport: preview?.meta?.qaReport ?? null,
        });
      }
      const resolved = await resolveDraftForStore(prisma, 'temp', runId);
      const products = Array.isArray(resolved.products) ? resolved.products : [];
      const categories = Array.isArray(resolved.categories) ? resolved.categories : [];
      const status = resolved.status ?? 'not_found';
      const rp = resolved.draft?.preview;
      const rPreview = rp && typeof rp === 'object' ? rp : (typeof rp === 'string' ? (() => { try { return JSON.parse(rp); } catch { return {}; } })() : {});
      const body = {
        ok: true,
        storeId: 'temp',
        generationRunId: resolved.generationRunId ?? runId ?? null,
        status,
        draftId: (resolved.draft?.id != null ? String(resolved.draft.id) : ''),
        draft: resolved.draft ?? null,
        store: { ...(resolved.store ?? { id: 'temp', name: 'Untitled Store', type: 'General' }), userId: req.userId },
        products,
        categories,
        qaReport: rPreview?.meta?.qaReport ?? null,
      };
      return res.status(200).json(body);
    }

    // Real storeId: verify business exists and user has access
    let store;
    if (req.user?.isDevAdmin === true && process.env.NODE_ENV !== 'production') {
      store = await prisma.business.findUnique({
        where: { id: storeId },
        select: { id: true, userId: true },
      });
    } else {
      store = await prisma.business.findUnique({
        where: { id: storeId },
        select: { id: true, userId: true },
      });
    }

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'store_not_found',
        storeId,
        message: 'Store not found'
      });
    }

    const isDevAdmin = process.env.NODE_ENV !== 'production' && req.user?.isDevAdmin === true;
    if (!isDevAdmin && store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        storeId,
        message: 'You do not have permission to access this store'
      });
    }

    const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
    const products = Array.isArray(resolved.products) ? resolved.products : [];
    const categories = Array.isArray(resolved.categories) ? resolved.categories : [];
    const status = resolved.status ?? 'not_found';
    const rp = resolved.draft?.preview;
    const rPreview = rp && typeof rp === 'object' ? rp : (typeof rp === 'string' ? (() => { try { return JSON.parse(rp); } catch { return {}; } })() : {});
    const body = {
      ok: true,
      storeId,
      generationRunId: resolved.generationRunId ?? generationRunId ?? null,
      status,
      draftId: (resolved.draft?.id != null ? String(resolved.draft.id) : ''),
      draft: resolved.draft ?? null,
      store: { ...(resolved.store ?? { id: storeId, name: 'Untitled Store', type: 'General' }), userId: store.userId },
      products,
      categories,
      qaReport: rPreview?.meta?.qaReport ?? null,
    };
    return res.status(200).json(body);
  } catch (error) {
    console.error('[Stores:draft] Error:', error);
    next(error);
  }
});

/**
 * PATCH /api/stores/:storeId/draft/hero
 * Persist hero (and optionally avatar) URLs to draft preview. Auth required; draft ownership enforced.
 * Body: { imageUrl?, videoUrl?, source? } (dashboard) or { heroImageUrl?, avatarImageUrl?, generationRunId? }.
 * Response: 200 with updated draft summary or 404 if draft not found.
 */
router.patch('/:storeId/draft/hero', requireAuth, async (req, res, next) => {
  try {
    const result = await resolveDraftForStoreAsset(req);
    if (result.errorResponse) {
      return res.status(result.errorResponse.status).json(result.errorResponse.body);
    }
    const draft = result.draft;
    const body = req.body ?? {};
    const imageUrl = typeof body.heroImageUrl === 'string' ? body.heroImageUrl.trim() : (typeof body.imageUrl === 'string' ? body.imageUrl.trim() : null);
    const avatarImageUrl = typeof body.avatarImageUrl === 'string' ? body.avatarImageUrl.trim() : null;
    const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : null;
    const source = typeof body.source === 'string' ? body.source.trim() : null;
    const existingPreview = typeof draft.preview === 'string' ? (() => { try { return JSON.parse(draft.preview); } catch { return {}; } })() : (draft.preview || {});
    const existingHero = existingPreview.hero && typeof existingPreview.hero === 'object' ? existingPreview.hero : {};
    const hero = { ...existingHero };
    if (imageUrl != null) {
      hero.imageUrl = imageUrl;
      hero.url = imageUrl;
    }
    if (videoUrl != null) hero.videoUrl = videoUrl;
    if (source != null) hero.source = source;
    const patch = {};
    if (Object.keys(hero).length) patch.hero = hero;
    if (imageUrl != null) patch.heroImageUrl = imageUrl;
    if (avatarImageUrl) {
      patch.avatar = { imageUrl: avatarImageUrl, url: avatarImageUrl };
      patch.avatarImageUrl = avatarImageUrl;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'no_urls', message: 'Provide at least one of imageUrl/heroImageUrl, avatarImageUrl, videoUrl, or source' });
    }
    await patchDraftPreview(draft.id, patch);
    const updated = await getDraft(draft.id);
    return res.status(200).json({ ok: true, draftId: updated.id, status: updated.status, hero: patch.hero, heroImageUrl: patch.heroImageUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/stores/:storeId/draft/avatar
 * Persist avatar URL to draft preview. Auth required; draft ownership enforced.
 * Body: { avatarImageUrl?, imageUrl?, generationRunId? } (generationRunId required when storeId is "temp").
 */
router.patch('/:storeId/draft/avatar', requireAuth, async (req, res, next) => {
  try {
    const result = await resolveDraftForStoreAsset(req);
    if (result.errorResponse) {
      return res.status(result.errorResponse.status).json(result.errorResponse.body);
    }
    const draft = result.draft;
    const body = req.body ?? {};
    const avatarImageUrl = typeof body.avatarImageUrl === 'string' ? body.avatarImageUrl.trim() : (typeof body.imageUrl === 'string' ? body.imageUrl.trim() : null);
    if (!avatarImageUrl) {
      return res.status(400).json({ ok: false, error: 'no_url', message: 'Provide avatarImageUrl or imageUrl' });
    }
    const existingPreview = typeof draft.preview === 'string' ? (() => { try { return JSON.parse(draft.preview); } catch { return {}; } })() : (draft.preview || {});
    const existingAvatar = existingPreview.avatar && typeof existingPreview.avatar === 'object' ? existingPreview.avatar : {};
    const avatar = { ...existingAvatar, imageUrl: avatarImageUrl, url: avatarImageUrl };
    await patchDraftPreview(draft.id, { avatar, avatarImageUrl });
    const updated = await getDraft(draft.id);
    return res.status(200).json({ ok: true, draftId: updated.id, status: updated.status, avatar, avatarImageUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/stores/:storeId/owner-profile-visibility
 * Toggle whether the owner's personal profile is shown on the store frontpage.
 *
 * Body: { showOwnerProfile: boolean }
 * Auth: requireAuth (only the store owner)
 * Response: { ok: true, showOwnerProfile: boolean }
 */
router.patch('/:storeId/owner-profile-visibility', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const parsed = OwnerProfileVisibilitySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'store_not_found',
        message: 'Store not found',
      });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have permission to update this store',
      });
    }

    const updated = await prisma.business.update({
      where: { id: storeId },
      data: { showOwnerProfile: parsed.data.showOwnerProfile },
      select: { showOwnerProfile: true },
    });

    return res.json({ ok: true, showOwnerProfile: updated.showOwnerProfile ?? false });
  } catch (error) {
    console.error('[Stores] PATCH owner-profile-visibility error:', error);
    next(error);
  }
});

/**
 * POST /api/stores/:storeId/upload/hero
 * Upload hero image and persist URL to draft preview. Auth required; draft ownership enforced.
 * Multipart field: "file". Query: generationRunId (required when storeId is "temp").
 * Returns: { ok: true, heroImageUrl, url } (dashboard also accepts url or imageUrl).
 */
/** Wraps multer so fileFilter/limits errors return 400 instead of 500 */
function storeAssetUploadSingle(req, res, next) {
  storeAssetUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: 'invalid_file', message: err.message || 'Invalid or missing file' });
    }
    next();
  });
}

router.post('/:storeId/upload/hero', requireAuth, storeAssetUploadSingle, async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: 'no_file', message: 'No file uploaded; use multipart field "file".' });
    }
    const result = await resolveDraftForStoreAsset(req);
    if (result.errorResponse) {
      return res.status(result.errorResponse.status).json(result.errorResponse.body);
    }
    const draft = result.draft;
    const buffer = req.file.buffer;
    const mime = req.file.mimetype || 'image/jpeg';
    const { key, url: storageUrl } = await uploadBufferToS3(buffer, req.file.originalname || 'hero.jpg', mime);
    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);
    try {
      await prisma.media.create({
        data: {
          url: normalizedUrl,
          storageKey: key,
          kind: 'IMAGE',
          mime,
          sizeBytes: buffer.length,
        },
      });
    } catch (mediaErr) {
      console.warn('[Stores] upload/hero: Media create failed (non-fatal), draft preview will still be updated:', mediaErr?.message);
    }
    const heroImageUrl = normalizedUrl;
    const existingPreview = typeof draft.preview === 'string' ? (() => { try { return JSON.parse(draft.preview); } catch { return {}; } })() : (draft.preview || {});
    const mergedHero = { ...(existingPreview.hero && typeof existingPreview.hero === 'object' ? existingPreview.hero : {}), imageUrl: heroImageUrl, url: heroImageUrl };
    await patchDraftPreview(draft.id, {
      hero: mergedHero,
      heroImageUrl,
    });
    return res.status(200).json({ ok: true, url: heroImageUrl, heroImageUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/stores/:storeId/upload/avatar
 * Upload avatar image and persist URL to draft preview. Auth required; draft ownership enforced.
 * Multipart field: "file". Query: generationRunId (required when storeId is "temp").
 * Returns: { ok: true, avatarImageUrl, url }.
 */
router.post('/:storeId/upload/avatar', requireAuth, storeAssetUploadSingle, async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: 'no_file', message: 'No file uploaded; use multipart field "file".' });
    }
    const result = await resolveDraftForStoreAsset(req);
    if (result.errorResponse) {
      return res.status(result.errorResponse.status).json(result.errorResponse.body);
    }
    const draft = result.draft;
    const buffer = req.file.buffer;
    const mime = req.file.mimetype || 'image/jpeg';
    const { key, url: storageUrl } = await uploadBufferToS3(buffer, req.file.originalname || 'avatar.jpg', mime);
    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);
    try {
      await prisma.media.create({
        data: {
          url: normalizedUrl,
          storageKey: key,
          kind: 'IMAGE',
          mime,
          sizeBytes: buffer.length,
        },
      });
    } catch (mediaErr) {
      console.warn('[Stores] upload/avatar: Media create failed (non-fatal), draft preview will still be updated:', mediaErr?.message);
    }
    const avatarImageUrl = normalizedUrl;
    const existingPreview = typeof draft.preview === 'string' ? (() => { try { return JSON.parse(draft.preview); } catch { return {}; } })() : (draft.preview || {});
    const mergedAvatar = { ...(existingPreview.avatar && typeof existingPreview.avatar === 'object' ? existingPreview.avatar : {}), imageUrl: avatarImageUrl, url: avatarImageUrl };
    await patchDraftPreview(draft.id, {
      avatar: mergedAvatar,
      avatarImageUrl,
    });
    return res.status(200).json({ ok: true, url: avatarImageUrl, avatarImageUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/stores/:storeId/draft/auto-categorize
 * Recompute categories from draft products and persist to draft.preview.categories.
 * For storeId "temp": body or query generationRunId required.
 * Returns same shape as GET /:storeId/draft (ok, draftId, draft, store, products, categories).
 */
router.post('/:storeId/draft/auto-categorize', optionalAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const generationRunId = typeof req.body?.generationRunId === 'string' ? req.body.generationRunId : (typeof req.query.generationRunId === 'string' ? req.query.generationRunId : null);
    if (storeId === 'temp' && !generationRunId) {
      return res.status(400).json({ ok: false, error: 'generationRunId required when storeId is temp' });
    }
    let draft = null;
    if (storeId === 'temp') {
      draft = await getDraftByGenerationRunId(generationRunId);
    } else {
      if (!req.user && !req.userId) {
        return res.status(401).json({ ok: false, error: 'unauthorized_token_required' });
      }
      const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
      draft = resolved.draft ?? null;
    }
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'draft_not_found', message: 'Draft not found' });
    }
    await autoCategorizeDraft(draft.id);
    const updated = await getDraft(draft.id);
    const preview = typeof updated.preview === 'string' ? JSON.parse(updated.preview) : (updated.preview || {});
    const products = (Array.isArray(preview.items) ? preview.items : []).map((item) => ({ ...item, description: item?.description ?? null }));
    const categories = Array.isArray(preview.categories) ? preview.categories : [];
    const runId = draft.input?.generationRunId || generationRunId;
    return res.status(200).json({
      ok: true,
      storeId: storeId === 'temp' ? 'temp' : storeId,
      generationRunId: runId,
      status: updated.status === 'ready' || updated.status === 'draft' ? 'ready' : updated.status,
      draftId: String(updated.id),
      draft: updated,
      store: { id: storeId === 'temp' ? 'temp' : storeId, name: preview.storeName || 'Untitled Store', type: preview.storeType || 'General' },
      products,
      categories,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stores/:id
 * Get a specific store by ID
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Response (200):
 *   - ok: true
 *   - store: Store object
 * 
 * Errors:
 *   - 401: Not authenticated
 *   - 403: Store does not belong to user
 *   - 404: Store not found
 */

/**
 * Helper: ensure user owns store (Business). Returns [business, null] or [null, res].
 */
async function ensureStoreOwner(req, res, storeId) {
  const business = await prisma.business.findUnique({ where: { id: storeId } });
  if (!business) {
    res.status(404).json({ ok: false, error: 'Store not found', message: 'Store not found' });
    return [null, res];
  }
  const isDevAdmin = process.env.NODE_ENV !== 'production' && req.user?.isDevAdmin === true;
  if (!isDevAdmin && business.userId !== req.userId) {
    res.status(403).json({ ok: false, error: 'Forbidden', message: 'You do not have permission to access this store' });
    return [null, res];
  }
  return [business, null];
}

/**
 * GET /api/stores/:storeId/image-mismatch
 * Detect product image/catalog mismatches (template items). Read-only.
 * Auth required; store owner only. Query: generationRunId (optional).
 * Response: { ok: true, hasIssue: boolean, affectedCount: number }
 */
router.get('/:storeId/image-mismatch', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const generationRunId = typeof req.query.generationRunId === 'string' ? req.query.generationRunId.trim() || null : null;
    if (!storeId || storeId === 'temp') {
      return res.status(400).json({ ok: false, error: 'storeId required', message: 'Store ID is required' });
    }
    const [business, errRes] = await ensureStoreOwner(req, res, storeId);
    if (errRes) return;
    const result = await detectStoreImageMismatch(prisma, storeId, generationRunId);
    return res.json({ ok: true, hasIssue: result.hasIssue, affectedCount: result.affectedCount });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/stores/:storeId/fix-image-mismatch
 * One-click fix: create mission run with intent store_fix_image_mismatch, dispatch via Tool Adapter.
 * Auth required; store owner only. Body: { generationRunId?: string }.
 * Response: { ok: true, missionId, runId, status: 'queued' }. Frontend polls run for completion.
 */
router.post('/:storeId/fix-image-mismatch', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const generationRunId = typeof req.body?.generationRunId === 'string' ? req.body.generationRunId.trim() || null : null;
    if (!storeId || storeId === 'temp') {
      return res.status(400).json({ ok: false, error: 'storeId required', message: 'Store ID is required' });
    }
    const [business, errRes] = await ensureStoreOwner(req, res, storeId);
    if (errRes) return;
    const user = req.user || { id: req.userId };
    if (!user?.id) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const missionId = `store-fix-${storeId}`;
    const mission = await getOrCreateMission(missionId, user, { title: 'Store catalog fix' });
    const tenantId = mission.tenantId || getTenantId(user) || user.id;
    const run = await createAgentRun({
      missionId,
      tenantId,
      agentKey: 'planner',
      input: { intent: 'store_fix_image_mismatch', storeId, generationRunId },
    });
    executeAgentRunInProcess(run.id).catch((err) => {
      console.warn('[Stores] fix-image-mismatch run failed:', err?.message || err);
    });
    return res.status(201).json({
      ok: true,
      missionId,
      runId: run.id,
      status: 'queued',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stores/:storeId/promos
 * List promos for a store. Auth required; store owner only.
 */
router.get('/:storeId/promos', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const [business, errRes] = await ensureStoreOwner(req, res, storeId);
    if (errRes) return;
    const promos = await prisma.storePromo.findMany({
      where: { storeId: business.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, promos });
  } catch (error) {
    console.error('[Stores] List promos error:', error);
    next(error);
  }
});

/**
 * POST /api/stores/:storeId/promos
 * Create a Scan & Redeem promo (legacy path). Generates slug; same as POST /api/promos with storeId.
 */
router.post('/:storeId/promos', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const [business, errRes] = await ensureStoreOwner(req, res, storeId);
    if (errRes) return;
    const { title, description, code, startsAt, endsAt, heroImage, heroImageUrl, subtitle, ctaLabel, targetUrl, productId } = req.body ?? {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'Title is required', message: 'Title is required' });
    }
    const { generateUniqueShortSlug } = await import('../utils/shortSlug.js');
    const slug = await generateUniqueShortSlug(prisma);
    const baseTarget = `/feed/${business.slug}`;
    const resolvedTarget = (targetUrl && typeof targetUrl === 'string' && targetUrl.trim()) ? targetUrl.trim() : (productId && typeof productId === 'string' && productId.trim() ? `${baseTarget}?product=${encodeURIComponent(productId.trim())}` : baseTarget);
    const promo = await prisma.storePromo.create({
      data: {
        storeId: business.id,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        code: typeof code === 'string' ? code.trim() || null : null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        heroImage: typeof heroImage === 'string' ? heroImage.trim() || null : null,
        heroImageUrl: typeof heroImageUrl === 'string' ? heroImageUrl.trim() || null : null,
        subtitle: typeof subtitle === 'string' ? subtitle.trim() || null : null,
        ctaLabel: typeof ctaLabel === 'string' ? ctaLabel.trim() || null : null,
        targetUrl: resolvedTarget,
        productId: typeof productId === 'string' ? productId.trim() || null : null,
        slug,
        isActive: true,
        scanCount: 0,
      },
    });
    res.status(201).json({ ok: true, promo });
  } catch (error) {
    console.error('[Stores] Create promo error:', error);
    next(error);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const store = await prisma.business.findUnique({
      where: { id }
    });

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
        message: 'Store not found'
      });
    }

    // Dev-admin bypass: Allow dev-admin-token to access any store in non-production
    const isDevAdmin = process.env.NODE_ENV !== 'production' && req.user?.isDevAdmin === true;
    if (!isDevAdmin && store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not have permission to access this store'
      });
    }

    res.json({
      ok: true,
      store
    });
  } catch (error) {
    console.error('[Stores] Get error:', error);
    next(error);
  }
});

/**
 * GET /api/stores/:id/intent-signals
 * Intent Capture: basic counts (page views, QR scans) for dashboard. requireAuth; store owner only.
 */
router.get('/:id/intent-signals', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.params.id?.trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const [pageViews, qrScans] = await Promise.all([
      prisma.intentSignal.count({ where: { storeId, type: { in: ['offer_view', 'page_view'] } } }),
      prisma.intentSignal.count({ where: { storeId, type: 'qr_scan' } }),
    ]);
    return res.json({ ok: true, pageViews, qrScans });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stores/:id/signals-summary
 * Store-level signal summary (storeViews, offerViews, qrScans, etc.). requireAuth; store owner only.
 */
router.get('/:id/signals-summary', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.params.id?.trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const windowDays = Math.min(Math.max(parseInt(req.query.window, 10) || 7, 1), 30);
    const { getStoreSignalSummary } = await import('../services/storeSignals.js');
    const summary = await getStoreSignalSummary(prisma, store.id, windowDays);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stores/:id/offers/:offerId/signals
 * Promotion signal summary for an offer (views, qrScans, ctaClicks, redeems). requireAuth; store owner only.
 */
router.get('/:id/offers/:offerId/signals', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.params.id?.trim();
    const offerId = req.params.offerId?.trim();
    if (!storeId || !offerId) {
      return res.status(400).json({ ok: false, error: 'storeId and offerId required' });
    }
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const windowDays = Math.min(Math.max(parseInt(req.query.window, 10) || 7, 1), 30);
    const { getPromotionSignalSummary } = await import('../services/promotionSignals.js');
    const summary = await getPromotionSignalSummary(prisma, store.id, offerId, windowDays);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stores/:id/opportunities
 * IntentOpportunity v0: list open opportunities (compute on demand). requireAuth; store owner only.
 */
router.get('/:id/opportunities', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.params.id?.trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId required' });
    }
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const { computeOpportunities } = await import('../services/intentOpportunities.js');
    const windowDays = Math.min(Math.max(parseInt(req.query.window, 10) || 7, 1), 30);
    const { opportunities } = await computeOpportunities(prisma, store.id, windowDays);
    return res.json({
      ok: true,
      opportunities: opportunities.map((o) => ({
        id: o.id,
        storeId: o.storeId,
        offerId: o.offerId,
        type: o.type,
        severity: o.severity,
        status: o.status,
        summary: o.summary,
        evidence: o.evidence,
        recommendedIntentType: o.recommendedIntentType,
        payload: o.payload,
        createdAt: o.createdAt,
        /** 'rules' | 'llm_inference' — for Promotion Opportunity Panel source badge (null/undefined → UI shows "Rules") */
        source: o.source ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/stores/:id/opportunities/:opportunityId/accept
 * Create an IntentRequest in the mission inbox (single runway). Body: { missionId }. requireAuth; store owner only.
 */
router.post('/:id/opportunities/:opportunityId/accept', requireAuth, async (req, res, next) => {
  try {
    // Guest users may create and inspect draft only; post-draft actions (e.g. accept opportunity) require registration
    if (req.user?.role === 'guest') {
      return res.status(403).json({
        ok: false,
        error: 'account_required',
        message: 'Create an account to continue running business actions. Sign in or sign up to launch offers, publish your feed, and use growth actions.',
      });
    }
    const storeId = req.params.id?.trim();
    const opportunityId = req.params.opportunityId?.trim();
    const missionId = req.body?.missionId && typeof req.body.missionId === 'string' ? req.body.missionId.trim() : '';
    if (!storeId || !opportunityId) {
      return res.status(400).json({ ok: false, error: 'storeId and opportunityId required' });
    }
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'missionId required in body' });
    }
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const opportunity = await prisma.intentOpportunity.findFirst({
      where: { id: opportunityId, storeId: store.id, status: 'open' },
    });
    if (!opportunity) {
      return res.status(404).json({ ok: false, error: 'Opportunity not found or not open' });
    }
    const { getOrCreateMission } = await import('../lib/mission.js');
    try {
      await getOrCreateMission(missionId, req.user, { title: 'Mission' });
    } catch (e) {
      console.warn('[Stores] getOrCreateMission for accept:', e.message);
    }
    const canAccess = await (async () => {
      const mission = await prisma.mission.findUnique({
        where: { id: missionId },
        select: { createdByUserId: true, tenantId: true },
      });
      if (mission) {
        const uid = req.user?.id;
        const bid = req.user?.business?.id;
        return (
          mission.createdByUserId === uid ||
          mission.tenantId === uid ||
          mission.tenantId === bid
        );
      }
      const task = await prisma.orchestratorTask.findUnique({
        where: { id: missionId },
        select: { userId: true, tenantId: true },
      });
      if (!task) return false;
      const uid = req.user?.id;
      const bid = req.user?.business?.id;
      return (
        task.userId === uid ||
        task.tenantId === uid ||
        task.tenantId === bid
      );
    })();
    if (!canAccess) {
      return res.status(403).json({ ok: false, error: 'Cannot add intent to this mission' });
    }
    const payload = opportunity.payload && typeof opportunity.payload === 'object' ? opportunity.payload : {};
    const intent = await prisma.intentRequest.create({
      data: {
        missionId,
        userId: req.user.id,
        type: opportunity.recommendedIntentType,
        payload: { ...payload, storeId: store.id },
        status: 'queued',
      },
    });
    // payload preserves offerName (and offerId) so Mission Inbox can show "Create QR for Rose Bundle" etc.
    await prisma.intentOpportunity.update({
      where: { id: opportunity.id },
      data: { status: 'accepted', updatedAt: new Date() },
    });
    return res.status(201).json({
      ok: true,
      intentRequestId: intent.id,
      opportunityId: opportunity.id,
      recommendedIntentType: opportunity.recommendedIntentType,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/stores/:id/opportunities/:opportunityId
 * Update opportunity status (later | dismissed). Body: { status }. requireAuth; store owner only.
 */
router.patch('/:id/opportunities/:opportunityId', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.params.id?.trim();
    const opportunityId = req.params.opportunityId?.trim();
    const status = req.body?.status === 'later' || req.body?.status === 'dismissed' ? req.body.status : null;
    if (!storeId || !opportunityId || !status) {
      return res.status(400).json({ ok: false, error: 'storeId, opportunityId, and status (later|dismissed) required' });
    }
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!store || store.userId !== req.userId) {
      return res.status(404).json({ ok: false, error: 'Store not found' });
    }
    const opportunity = await prisma.intentOpportunity.findFirst({
      where: { id: opportunityId, storeId: store.id, status: 'open' },
    });
    if (!opportunity) {
      return res.status(404).json({ ok: false, error: 'Opportunity not found or not open' });
    }
    await prisma.intentOpportunity.update({
      where: { id: opportunity.id },
      data: { status, updatedAt: new Date() },
    });
    return res.json({ ok: true, opportunityId, status });
  } catch (err) {
    next(err);
  }
});

// Zod schema for store update validation
const StoreUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  tradingHours: z.any().optional(), // JSON object, validate structure if needed
  address: z.string().trim().nullable().optional(),
  suburb: z.string().trim().nullable().optional(),
  postcode: z.string().trim().nullable().optional(),
  country: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  storefrontSettings: z.object({
    defaultView: z.enum(['list', 'grid']).optional(),
    allowUserToggle: z.boolean().optional(),
  }).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'At least one field must be provided for update'
  }
);

/**
 * PATCH /api/stores/:id
 * Update a store (supports all business fields)
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Request body (all fields optional):
 *   - name?: string
 *   - description?: string | null
 *   - tradingHours?: object (JSON)
 *   - address?: string | null
 *   - suburb?: string | null
 *   - postcode?: string | null
 *   - country?: string | null
 *   - phone?: string | null
 *   - lat?: number (between -90 and 90)
 *   - lng?: number (between -180 and 180)
 * 
 * Response (200):
 *   - ok: true
 *   - store: Updated Store object
 * 
 * Errors:
 *   - 400: Invalid input
 *   - 401: Not authenticated
 *   - 403: Store does not belong to user
 *   - 404: Store not found
 */
router.patch('/:id', requireAuth, requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body with zod
    const validationResult = StoreUpdateSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }

    const updateData = validationResult.data;

    // Find store and verify ownership
    const store = await prisma.business.findUnique({
      where: { id }
    });

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
        message: 'Store not found'
      });
    }

    if (store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this store'
      });
    }

    // Build update data object, handling null values and trimming strings
    const prismaUpdateData = {};
    
    if (updateData.name !== undefined) {
      prismaUpdateData.name = updateData.name;
    }
    if (updateData.description !== undefined) {
      prismaUpdateData.description = updateData.description === '' ? null : updateData.description;
    }
    if (updateData.tradingHours !== undefined) {
      prismaUpdateData.tradingHours = updateData.tradingHours;
    }
    if (updateData.address !== undefined) {
      prismaUpdateData.address = updateData.address === '' ? null : updateData.address;
    }
    if (updateData.suburb !== undefined) {
      prismaUpdateData.suburb = updateData.suburb === '' ? null : updateData.suburb;
    }
    if (updateData.postcode !== undefined) {
      prismaUpdateData.postcode = updateData.postcode === '' ? null : updateData.postcode;
    }
    if (updateData.country !== undefined) {
      prismaUpdateData.country = updateData.country === '' ? null : updateData.country;
    }
    if (updateData.phone !== undefined) {
      prismaUpdateData.phone = updateData.phone === '' ? null : updateData.phone;
    }
    if (updateData.lat !== undefined) {
      prismaUpdateData.lat = updateData.lat;
    }
    if (updateData.lng !== undefined) {
      prismaUpdateData.lng = updateData.lng;
    }
    if (updateData.storefrontSettings !== undefined) {
      const s = updateData.storefrontSettings;
      const merged = (store.storefrontSettings && typeof store.storefrontSettings === 'object')
        ? { ...store.storefrontSettings }
        : { defaultView: 'grid', allowUserToggle: true };
      if (s.defaultView === 'list' || s.defaultView === 'grid') merged.defaultView = s.defaultView;
      if (typeof s.allowUserToggle === 'boolean') merged.allowUserToggle = s.allowUserToggle;
      prismaUpdateData.storefrontSettings = merged;
    }

    // Handle lifecycleStage update via stylePreferences.meta (if provided in request body)
    // This allows frontend to update lifecycleStage without modifying the schema
    if (req.body.lifecycleStage !== undefined) {
      const validLifecycleStages = ['generated', 'configuring', 'live'];
      if (validLifecycleStages.includes(req.body.lifecycleStage)) {
        // Get existing stylePreferences or create new metadata object
        let existingMeta = {};
        if (store.stylePreferences && typeof store.stylePreferences === 'object') {
          existingMeta = store.stylePreferences;
        } else if (typeof store.stylePreferences === 'string') {
          try {
            existingMeta = JSON.parse(store.stylePreferences);
          } catch {
            existingMeta = {};
          }
        }
        
        // Update metadata with new lifecycleStage
        const updatedMeta = {
          ...existingMeta,
          lifecycleStage: req.body.lifecycleStage,
          updatedAt: new Date().toISOString()
        };
        
        prismaUpdateData.stylePreferences = updatedMeta;
      }
    }

    // Update store
    const updatedStore = await prisma.business.update({
      where: { id },
      data: prismaUpdateData
    });

    console.log(`[Stores] ✅ Store updated: ${updatedStore.slug} by user ${req.userId}`);

    res.json({
      ok: true,
      store: updatedStore
    });
  } catch (error) {
    console.error('[Stores] Update error:', error);
    next(error);
  }
});

// In-memory cache for stats (60 seconds TTL)
const statsCache = new Map();

/**
 * GET /api/stores/:id/stats
 * Get minimal statistics for a store
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Response (200):
 *   - ok: true
 *   - stats: { products: number, screens: number, playlists: number, lastUpdated: Date }
 * 
 * Errors:
 *   - 401: Not authenticated
 *   - 403: Store does not belong to user
 *   - 404: Store not found
 */
router.get('/:id/stats', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `store-${id}-stats`;

    // Test-only cache bypass: if NODE_ENV === 'test' and x-test-no-cache header is present, skip cache
    const testNoCache = process.env.NODE_ENV === 'test' && req.get('x-test-no-cache') === '1';

    // Check cache (skip if test bypass is enabled)
    if (!testNoCache) {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 60000)) {
        return res.json({
          ok: true,
          stats: cached.data
        });
      }
    }

    // Find store and verify ownership
    const store = await prisma.business.findUnique({
      where: { id }
    });

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
        message: 'Store not found'
      });
    }

    if (store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not have permission to view this store'
      });
    }

    // Test-only debug log: verify ID matching
    if (process.env.NODE_ENV === 'test' && process.env.DEBUG_TESTS === '1') {
      console.log('[Stats Debug]', {
        storeIdParam: id,
        businessIdUsedForCounts: id, // Stats uses req.params.id as businessId
        storeIdFromStore: store.id,
        match: id === store.id
      });
    }

    // Get stats from existing tables
    const [productsCount, screensCount, playlistsCount] = await Promise.all([
      prisma.product.count({
        where: {
          businessId: id, // Uses req.params.id as businessId
          deletedAt: null
        }
      }),
      prisma.screen.count({
        where: {
          deletedAt: null
          // Note: Screens are not directly linked to stores in current schema
          // This counts all screens. Adjust if screens are store-scoped in future.
        }
      }),
      prisma.playlist.count({
        // Note: Playlists are not directly linked to stores in current schema
        // This counts all playlists. Adjust if playlists are store-scoped in future.
      })
    ]);

    const stats = {
      products: productsCount,
      screens: screensCount,
      playlists: playlistsCount,
      lastUpdated: new Date().toISOString()
    };

    // Cache the result (skip if test bypass is enabled)
    if (!testNoCache) {
      statsCache.set(cacheKey, {
        data: stats,
        timestamp: Date.now()
      });
    }

    // Clean up old cache entries (older than 5 minutes)
    const now = Date.now();
    for (const [key, value] of statsCache.entries()) {
      if (now - value.timestamp > 300000) {
        statsCache.delete(key);
      }
    }

    res.json({
      ok: true,
      stats
    });
  } catch (error) {
    console.error('[Stores] Stats error:', error);
    next(error);
  }
});

/**
 * POST /api/stores/:id/identity
 * Update store identity (name, type, location)
 * Used when user wants to change store name/type before generating a new draft
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Request body:
 *   - name?: string (optional)
 *   - type?: string (optional)
 *   - location?: string (optional)
 * 
 * Response (200):
 *   - ok: true
 *   - store: Updated store object
 * 
 * Errors:
 *   - 400: Invalid request
 *   - 401: Not authenticated
 *   - 403: Not owner
 *   - 404: Store not found
 */
router.post('/:id/identity', requireAuth, requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, location } = req.body ?? {};

    // Find store and verify ownership
    const store = await prisma.business.findUnique({
      where: { id }
    });

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
        message: 'Store not found'
      });
    }

    if (store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this store'
      });
    }

    // Build update data
    const prismaUpdateData = {};
    
    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      prismaUpdateData.name = name.trim();
      // Update slug when name changes
      const newSlug = await generateUniqueStoreSlug(prisma, name.trim(), id);
      prismaUpdateData.slug = newSlug;
    }
    
    if (type !== undefined && typeof type === 'string' && type.trim().length > 0) {
      prismaUpdateData.type = type.trim();
    }
    
    // Store location in stylePreferences if provided
    if (location !== undefined) {
      let existingPrefs = {};
      if (store.stylePreferences && typeof store.stylePreferences === 'object') {
        existingPrefs = store.stylePreferences;
      } else if (typeof store.stylePreferences === 'string') {
        try {
          existingPrefs = JSON.parse(store.stylePreferences);
        } catch {
          existingPrefs = {};
        }
      }
      
      prismaUpdateData.stylePreferences = {
        ...existingPrefs,
        location: location.trim() || null,
        updatedAt: new Date().toISOString(),
      };
    }

    // Update store
    const updatedStore = await prisma.business.update({
      where: { id },
      data: prismaUpdateData
    });

    // CRITICAL: Emit ActivityEvent for store identity update
    try {
      await prisma.activityEvent.create({
        data: {
          tenantId: store.tenantId || req.userId,
          storeId: id,
          userId: req.userId,
          type: 'store_identity_updated',
          payload: {
            previous: {
              name: store.name,
              type: store.type,
            },
            updated: {
              name: updatedStore.name,
              type: updatedStore.type,
              location: location || null,
            },
            changedFields: Object.keys(prismaUpdateData).filter(key => key !== 'stylePreferences'),
          },
          occurredAt: new Date(),
        },
      });
    } catch (activityError) {
      // Non-fatal - log but don't fail the request
      console.warn('[Stores] Failed to create ActivityEvent for identity update (non-fatal):', activityError);
    }

    console.log(`[Stores] ✅ Store identity updated: ${updatedStore.slug} by user ${req.userId}`, {
      previousName: store.name,
      newName: updatedStore.name,
      previousType: store.type,
      newType: updatedStore.type,
    });

    return res.status(200).json({
      ok: true,
      store: updatedStore
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/store/publish
 * Publish a draft store (commit DraftStore to Business + Products)
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Request body:
 *   - storeId: string (required)
 *   - generationRunId?: string (optional, if missing publishes "best draft" for storeId)
 * 
 * Response (200):
 *   - ok: true
 *   - publishedStoreId: string
 *   - publishedAt: string (ISO timestamp)
 *   - storefrontUrl: string
 * 
 * Errors:
 *   - 400: Missing storeId
 *   - 401: Not authenticated
 *   - 403: Not owner
 *   - 404: No draft to publish
 *   - 500: Commit failed
 */
router.post('/publish', requireAuth, async (req, res, next) => {
  try {
    const { storeId: rawStoreId, generationRunId, draftId } = req.body ?? {};
    const storeId = rawStoreId && typeof rawStoreId === 'string' ? rawStoreId : null;

    if (!storeId) {
      return res.status(400).json({
        ok: false,
        error: 'storeId_required',
        message: 'storeId is required',
      });
    }

    // Guest publish in dev/test: requireAuth accepts minimal guest tokens (no DB user),
    // but publishDraft needs a real User row to attach the published Business.
    if (
      process.env.NODE_ENV !== 'production' &&
      req.user &&
      String(req.user.role ?? '') === 'guest' &&
      req.userId &&
      String(req.userId).startsWith('guest_')
    ) {
      const guestId = String(req.userId);
      const existing = await prisma.user
        .findUnique({ where: { id: guestId }, select: { id: true } })
        .catch(() => null);
      if (!existing) {
        await prisma.user.create({
          data: {
            id: guestId,
            email: `guest-${guestId}@cardbey.local`,
            passwordHash: 'guest',
            displayName: 'Guest',
            roles: '["viewer"]',
            role: 'viewer',
            emailVerified: false,
          },
        });
      }
    }

    const requireVerifiedToPublish =
      process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
    const allowUnverifiedPublish = process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === 'true' || process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === '1';
    const superAdminBypass = req.user && hasRole(req.user, 'super_admin') &&
      (process.env.NODE_ENV !== 'production' || process.env.PROD_OVERRIDE === 'true');
    // Only enforce email verification in production by default.
    if (process.env.NODE_ENV === 'production' && requireVerifiedToPublish && !allowUnverifiedPublish && !superAdminBypass && req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { emailVerified: true },
      });
      if (user && user.emailVerified !== true) {
        try {
          await prisma.auditEvent.create({
            data: {
              entityType: 'User',
              entityId: req.userId,
              action: 'publish_blocked_unverified',
              actorType: 'human',
              actorId: req.userId,
              reason: 'EMAIL_VERIFICATION_REQUIRED',
              metadata: { storeId },
            },
          });
        } catch (auditErr) {
          console.warn('[StorePublish] AuditEvent create failed (non-fatal):', auditErr?.message);
        }
        return res.status(403).json({
          ok: false,
          code: 'EMAIL_VERIFICATION_REQUIRED',
          error: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Please verify your email before publishing. Check your inbox for the verification link, or request a new one from the store review page.',
        });
      }
    }

    const result = await publishDraft(prisma, {
      storeId,
      generationRunId: generationRunId || undefined,
      draftId: draftId && typeof draftId === 'string' ? draftId.trim() : undefined,
      userId: req.userId,
    });

    const publishedAt = new Date();
    return res.status(200).json({
      ok: true,
      publishedStoreId: result.storeId,
      publishedAt: publishedAt.toISOString(),
      storefrontUrl: result.storefrontUrl,
    });
  } catch (error) {
    if (error instanceof PublishDraftError) {
      const status = error.statusCode || 500;
      return res.status(status).json({
        ok: false,
        code: error.code,
        error: error.code,
        message: error.message,
      });
    }
    console.error('[StorePublish] Error:', error);
    if (error?.code === 'P2021' || error?.code === 'P2022') {
      return res.status(409).json({
        ok: false,
        error: 'Database schema out of date',
        message: 'DB schema out of date — run prisma migrate dev',
        action: 'Run: cd apps/core/cardbey-core && npx prisma migrate status && npx prisma migrate dev',
      });
    }
    if (error?.code === 'P2003') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_reference',
        message: 'Publish failed: a required reference was not found. Please sign in again and retry.',
      });
    }
    if (error?.code === 'P2002') {
      return res.status(409).json({
        ok: false,
        error: 'conflict',
        message: 'A store with this identifier already exists. Please try again or use a different store.',
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/stores/:storeId
 * Hard delete a store and its dependent data. Owner only.
 *
 * Notes:
 * - Some relations cascade via Prisma schema (Product, StorePromo, StoreOffer).
 * - Some store-scoped tables are not relationally linked (Promotion*, SmartObject, IntentSignal/Opportunity),
 *   so we explicitly delete them to avoid orphaned data.
 */
router.delete('/:storeId', requireAuth, requireOwner, async (req, res, next) => {
  try {
    const storeId = typeof req.params?.storeId === 'string' ? req.params.storeId.trim() : '';
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId_required', message: 'storeId required' });
    }

    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, name: true },
    });
    if (!store) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Store not found' });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Forbidden' });
    }

    await prisma.$transaction(async (tx) => {
      // Explicit cleanup for non-cascading / loosely-related tables
      await tx.promotionPlacement.deleteMany({ where: { storeId } }).catch(() => {});
      await tx.promotion.deleteMany({ where: { storeId } }).catch(() => {});
      await tx.smartObject.deleteMany({ where: { storeId } }).catch(() => {});
      await tx.intentOpportunity.deleteMany({ where: { storeId } }).catch(() => {});
      await tx.intentSignal.deleteMany({ where: { storeId } }).catch(() => {});

      // Defensive deletes (also cascade in schema, but safe to run)
      await tx.storeOffer.deleteMany({ where: { storeId } }).catch(() => {});
      await tx.storePromo.deleteMany({ where: { storeId } }).catch(() => {});
      await tx.product.deleteMany({ where: { businessId: storeId } }).catch(() => {});

      await tx.business.delete({ where: { id: storeId } });
    });

    return res.json({ ok: true, deleted: storeId, name: store.name });
  } catch (err) {
    next(err);
  }
});

export default router;


