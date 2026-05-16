if (process.env.NODE_ENV !== 'production') {
  console.log('[LOAD] draftStore.js ownerTenantFix v3');
}
/**
 * Draft Store Routes
 * PATCH /api/draft-store/:draftId and GET (by draftId) require auth and tenant ownership.
 * POST /generate and POST /:draftId/commit may allow unauthenticated (rate-limited).
 *
 * Two ownership paths (for requireAuth routes that check draft access):
 * - Orchestra path: draft has generationRunId → ownership via OrchestratorTask.userId (store automation flow).
 * - Store path: draft from create-from-store → ownership via Business.userId for the draft's storeId
 *   (preview.meta.storeId / input.storeId / committedStoreId). Used by Performer onboarding.
 */

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import os from 'node:os';
import { getPrismaClient } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import { hasRole } from '../lib/authorization.js';
import { createDraft, createDraftStoreForUser, generateDraft, getDraft, getDraftByGenerationRunId, commitDraft, patchDraftPreview, normalizePreviewCategories, repairCatalog } from '../services/draftStore/draftStoreService.js';
import { isDraftOwnedByUser, canAccessDraftStore, draftOwnershipFieldsForLog } from '../lib/draftOwnership.js';
import { getTenantId } from '../lib/tenant.js';

/** Super admin can access any draft/store; used for ownership bypass only. */
function isSuperAdmin(req) {
  return !!req.user && hasRole(req.user, 'super_admin');
}
import { resolveDraftForStore } from '../lib/draftResolver.js';
import { slugify } from '../utils/slug.js';

/** Single shared Prisma client (same as rest of app). Ensures draft create and summary read use same DB. */
const prisma = getPrismaClient();

/** Instance identifier for diagnostics (multi-instance + SQLite can cause DRAFT_NOT_FOUND). */
function getInstanceId() {
  try {
    return os.hostname() || `pid-${process.pid}`;
  } catch {
    return `pid-${process.pid}`;
  }
}

/** Resolved DB path for logging (redact postgres). */
function getDatabasePathForLog() {
  const url = process.env.DATABASE_URL || '';
  if (url.toLowerCase().startsWith('postgres')) return 'postgresql://***';
  if (url.startsWith('file:')) return url.slice(5).trim() || url;
  return url || '(not set)';
}
const DEFAULT_EXPIRY_HOURS = 48;

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'), false);
    }
  },
});

// Simple rate limiting (in-memory, can be moved to Redis)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per minute per IP

function getRateLimitKey(req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

function checkRateLimit(req) {
  const key = getRateLimitKey(req);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  const requests = rateLimitMap.get(key) || [];
  const recentRequests = requests.filter(time => time > windowStart);
  
  if (recentRequests.length >= RATE_LIMIT_MAX) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(key, recentRequests);
  
  // Cleanup old entries
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (v.every(time => time < windowStart)) {
        rateLimitMap.delete(k);
      }
    }
  }
  
  return true;
}

// Request validation schemas
const GenerateDraftSchema = z.object({
  mode: z.enum(['ai', 'ocr', 'template', 'personal']),
  prompt: z.string().optional(), // For AI mode: business description
  templateId: z.string().optional(), // For template mode
  locale: z.string().optional().default('en'),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  location: z.string().optional(),
  projectName: z.string().optional(), // For personal mode
  firstIntent: z.string().optional(), // For personal mode
  includeImages: z.boolean().optional(), // Default true: generate item images in same run; false skips image calls
  menuFirstMode: z.boolean().optional(), // Use vertical-locked Menu AI; no item images
  menuOnly: z.boolean().optional(),
  ignoreImages: z.boolean().optional(),
  vertical: z.string().optional(), // e.g. sweets_bakery, cafe, florist
  priceTier: z.string().optional(),
});

const CommitDraftSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms of service',
  }),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  location: z.string().optional(),
});

/** Phase 0 Store Mission: create draft only (no generation). Body: { name?, category?, missionId? }. Returns { draftStoreId }. */
const CreateMissionDraftSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  missionId: z.string().optional(),
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = CreateMissionDraftSchema.safeParse(req.body || {});
    const body = parsed.success ? parsed.data : {};
    const businessName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New Store';
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'general';
    const missionId = typeof body.missionId === 'string' && body.missionId.trim() ? body.missionId.trim() : null;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);
    const input = {
      businessName,
      category,
      businessType: category,
      prompt: `${businessName} ${category}`,
      missionId,
      source: 'mission_phase0',
    };
    const draft = await createDraftStoreForUser(prisma, {
      user: req.user,
      userId: req.userId,
      tenantKey: getTenantId(req.user),
      input,
      expiresAt,
      mode: 'ai',
      status: 'draft',
    });
    return res.status(201).json({
      ok: true,
      draftStoreId: draft.id,
      status: draft.status,
    });
  } catch (err) {
    console.error('[DraftStore] POST / (create) error:', err);
    next(err);
  }
});

/**
 * POST /api/draft-store/generate
 * Generate a draft store preview without authentication
 * 
 * Request body (JSON or multipart/form-data):
 *   - mode: "ai" | "ocr" | "template" | "personal" (required)
 *   - prompt?: string (for AI mode: business description)
 *   - photo?: File (multipart, for OCR mode)
 *   - templateId?: string (for template mode)
 *   - locale?: string (default: "en")
 *   - businessName?: string (optional override)
 *   - businessType?: string (optional override)
 *   - location?: string (optional)
 *   - projectName?: string (for personal mode)
 *   - firstIntent?: string (for personal mode)
 *   - includeImages?: boolean (default true; false skips item image generation in same run)
 * 
 * Response (200):
 *   - ok: true
 *   - draftId: string
 *   - status: 'generating' | 'ready'
 */
router.post('/generate', guestSessionId, optionalAuth, upload.single('photo'), async (req, res, next) => {
  try {
    // Rate limiting
    if (!checkRateLimit(req)) {
      return res.status(429).json({
        ok: false,
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again in a minute.',
      });
    }

    // Validate request body
    const validationResult = GenerateDraftSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    const { mode, prompt, templateId, locale, businessName, businessType, location, projectName, firstIntent, includeImages, menuFirstMode, menuOnly, ignoreImages, vertical, priceTier } = validationResult.data;

    // Prepare input data (includeImages passed through for generateDraft)
    const input = {
      prompt,
      templateId,
      locale,
      businessName,
      businessType,
      location,
      projectName,
      firstIntent,
      includeImages,
      menuFirstMode,
      menuOnly,
      ignoreImages,
      vertical,
      priceTier,
    };

    // Handle OCR mode with file upload
    if (mode === 'ocr' && req.file) {
      try {
        const base64Image = req.file.buffer.toString('base64');
        const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;
        input.photoDataUrl = dataUrl;
      } catch (fileError) {
        console.error('[DraftStore] File processing error:', fileError);
        return res.status(400).json({
          ok: false,
          error: 'file_processing_failed',
          message: 'Failed to process uploaded file',
        });
      }
    }

    // Get metadata for tracking
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
    const userAgent = req.get('user-agent') || null;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    let draft;
    if (req.userId || req.user) {
      draft = await createDraftStoreForUser(prisma, {
        user: req.user,
        userId: req.userId,
        tenantKey: getTenantId(req.user),
        input,
        expiresAt,
        mode,
        status: 'generating',
        ipHash,
        userAgent,
        guestSessionId: req.guestSessionId || null,
      });
    } else {
      draft = await createDraft({
        mode,
        input,
        meta: {
          ipHash,
          userAgent,
          guestSessionId: req.guestSessionId || null,
          ownerUserId: null,
        },
      });
    }

    // Generate preview inline (for MVP - can be made async later). Pass userId for paid AI (mode 'ai') gating.
    let status = 'generating';
    try {
      await generateDraft(draft.id, { userId: req.userId ?? null });
      status = 'ready';
    } catch (genError) {
      console.error(`[DraftStore] Generation error for draft ${draft.id}:`, genError);
      if (genError.code === 'AUTH_REQUIRED_FOR_AI') {
        return res.status(401).json({
          ok: false,
          code: 'AUTH_REQUIRED_FOR_AI',
          message: genError.message || 'Authentication required to use paid AI',
        });
      }
      if (genError.code === 'INSUFFICIENT_CREDITS') {
        return res.status(402).json({
          ok: false,
          code: 'INSUFFICIENT_CREDITS',
          message: genError.message || 'Insufficient credits for this action',
        });
      }
      if (genError.code === 'AI_IMAGE_CAP_EXCEEDED') {
        return res.status(400).json({
          ok: false,
          code: 'AI_IMAGE_CAP_EXCEEDED',
          message: genError.message || 'AI image count exceeds maximum',
        });
      }
      if (genError.code === 'PAID_AI_JOB_IN_PROGRESS') {
        return res.status(202).json({
          ok: true,
          code: 'PAID_AI_JOB_IN_PROGRESS',
          message: genError.message || 'A paid AI job for this draft is already in progress',
          draftId: draft.id,
          jobId: genError.jobId ?? null,
        });
      }
      status = 'failed';
      // Still return draftId so frontend can check status
    }

    res.json({
      ok: true,
      draftId: draft.id,
      status,
    });
  } catch (error) {
    console.error('[DraftStore] Generate error:', error);
    next(error);
  }
});

/**
 * GET /api/draft-store/by-store/:storeId
 * Get draft for an existing store. Requires auth; store must belong to user (tenant ownership).
 * Returns 404 when no draft exists for the store.
 */
router.get('/by-store/:storeId', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_store_id',
        message: 'storeId is required',
      });
    }
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (!business) {
      return res.status(404).json({
        ok: false,
        error: 'store_not_found',
        message: 'Store not found',
      });
    }
    if (!isSuperAdmin(req) && business.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this store.',
      });
    }
    const resolved = await resolveDraftForStore(prisma, storeId, null);
    if (!resolved.draft || resolved.status === 'not_found') {
      return res.status(404).json({
        ok: false,
        error: 'draft_not_found',
        message: 'No draft found for this store',
      });
    }
    const draft = resolved.draft;
    const preview = typeof draft.preview === 'string' ? JSON.parse(draft.preview) : (draft.preview || {});
    return res.json({
      ok: true,
      draftId: draft.id,
      storeId,
      status: draft.status,
      preview,
      mode: draft.mode,
      input: draft.input,
      error: draft.error,
    });
  } catch (error) {
    console.error('[DraftStore] GET by-store error:', error);
    next(error);
  }
});

const CreateFromStoreSchema = z.object({
  storeId: z.string().min(1),
});

/**
 * POST /api/draft-store/create-from-store
 * Create a draft from an existing store (copy store + products into draft preview). Requires auth; store must belong to user.
 * Body: { storeId: string }
 * Returns: { ok: true, draftId, storeId, status: 'ready' }
 */
router.post('/create-from-store', requireAuth, async (req, res, next) => {
  try {
    const parsed = CreateFromStoreSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    const { storeId } = parsed.data;
    // Idempotent: if an edit draft already exists for this store, return it (e.g. "Back to edit" from preview)
    const resolved = await resolveDraftForStore(prisma, storeId, null);
    if (resolved.draft && (resolved.status === 'ready' || resolved.status === 'draft')) {
      return res.status(200).json({
        ok: true,
        draftId: String(resolved.draft.id),
        storeId,
        status: resolved.draft.status || 'ready',
      });
    }
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        userId: true,
        name: true,
        type: true,
        description: true,
        logo: true,
        primaryColor: true,
        secondaryColor: true,
        tagline: true,
        heroText: true,
        stylePreferences: true,
      },
    });
    if (!business) {
      return res.status(404).json({
        ok: false,
        error: 'store_not_found',
        message: 'Store not found',
      });
    }
    if (!isSuperAdmin(req) && business.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this store.',
      });
    }
    const products = await prisma.product.findMany({
      where: { businessId: storeId, deletedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true, price: true, category: true, imageUrl: true },
    });
    const catNames = [...new Set(products.map((p) => (p.category && String(p.category).trim()) || null).filter(Boolean))];
    const catKey = (name) => (name && slugify(String(name).trim())) || 'other';
    const categories = catNames.length
      ? catNames.map((name) => ({ id: catKey(name), name: String(name).trim() }))
      : [];
    if (!categories.some((c) => c.id === 'other')) {
      categories.push({ id: 'other', name: 'Other' });
    }
    const items = products.map((p) => {
      const catName = p.category ?? null;
      const categoryId = catKey(catName);
      return {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        price: p.price != null ? p.price : null,
        category: catName,
        categoryId,
        imageUrl: p.imageUrl ?? null,
      };
    });
    let heroImageUrl = null;
    let avatarUrl = null;
    if (business.logo) {
      try {
        const logoData = typeof business.logo === 'string' ? JSON.parse(business.logo) : business.logo;
        avatarUrl = logoData?.avatarUrl ?? logoData?.url ?? null;
        heroImageUrl = logoData?.bannerUrl ?? logoData?.heroUrl ?? logoData?.coverUrl ?? avatarUrl;
      } catch (_) {
        avatarUrl = business.logo;
        heroImageUrl = business.logo;
      }
    }
    if (business.stylePreferences && typeof business.stylePreferences === 'object') {
      const sp = business.stylePreferences;
      heroImageUrl = heroImageUrl ?? sp.heroImage ?? sp.heroImageUrl ?? null;
      avatarUrl = avatarUrl ?? sp.profileAvatarUrl ?? sp.avatarUrl ?? avatarUrl;
    }
    const preview = {
      storeName: business.name || 'My Store',
      storeType: business.type || 'General',
      slogan: business.tagline ?? business.description ?? null,
      heroText: business.heroText ?? business.description ?? null,
      categories,
      items,
      brandColors: {
        primary: business.primaryColor || '#6366f1',
        secondary: business.secondaryColor || '#8b5cf6',
      },
      hero: heroImageUrl ? { imageUrl: heroImageUrl, url: heroImageUrl } : undefined,
      avatar: avatarUrl ? { imageUrl: avatarUrl, url: avatarUrl } : undefined,
      meta: { storeId, storeName: business.name, storeType: business.type },
    };
    normalizePreviewCategories(preview);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);
    const draft = await createDraftStoreForUser(prisma, {
      user: req.user,
      userId: req.userId,
      tenantKey: getTenantId(req.user),
      input: { storeId, source: 'create-from-store' },
      expiresAt,
      mode: 'personal',
      status: 'ready',
      preview,
    });
    return res.status(201).json({
      ok: true,
      draftId: draft.id,
      storeId,
      status: draft.status,
    });
  } catch (error) {
    console.error('[DraftStore] POST create-from-store error:', error);
    next(error);
  }
});

/**
 * POST /api/draft-store/claim
 * Claim guest drafts for the authenticated user. Reads guestSessionId from cookie or X-Guest-Session header.
 * Body: { draftId?: string } — optional; if omitted, claims all drafts with matching guestSessionId and no owner.
 * Returns: { ok: true, claimedCount, draftIds }
 */
router.post('/claim', guestSessionId, requireAuth, async (req, res, next) => {
  try {
    const guestSessionIdValue = req.guestSessionId || (req.headers['x-guest-session'] && req.headers['x-guest-session'].trim());
    if (!guestSessionIdValue) {
      return res.status(400).json({
        ok: false,
        error: 'guest_session_required',
        message: 'Guest session ID required (cookie guestSessionId or header X-Guest-Session).',
      });
    }
    const { draftId } = req.body || {};
    const where = {
      guestSessionId: guestSessionIdValue,
      ownerUserId: null,
      status: { not: 'committed' },
    };
    if (draftId && typeof draftId === 'string' && draftId.trim()) {
      where.id = draftId.trim();
    }
    const drafts = await prisma.draftStore.findMany({
      where,
      select: { id: true },
    });
    if (drafts.length === 0) {
      return res.json({ ok: true, claimedCount: 0, draftIds: [] });
    }
    await prisma.draftStore.updateMany({
      where: { id: { in: drafts.map((d) => d.id) } },
      data: { ownerUserId: req.userId },
    });
    const draftIds = drafts.map((d) => d.id);
    console.log('[DraftStore] Claimed drafts', { userId: req.userId, claimedCount: draftIds.length, draftIds });
    res.json({ ok: true, claimedCount: draftIds.length, draftIds });
  } catch (error) {
    console.error('[DraftStore] POST claim error:', error);
    next(error);
  }
});

/**
 * PATCH /api/draft-store/:draftId
 * Update draft preview (items, categories, store meta). Requires auth; draft must belong to user via
 * Orchestra ownership (generationRunId) or store ownership (preview.meta.storeId / input.storeId / committedStoreId).
 * Request body: { preview: { items?, catalog?, categories?, storeName?, storeType?, ... } }
 * Response (200): same as GET (ok, draftId, status, preview, mode, input)
 */
const PatchDraftSchema = z.object({
  preview: z.record(z.unknown()).optional(),
});
router.patch('/:draftId', requireAuth, async (req, res, next) => {
  try {
    const { draftId } = req.params;
    const parsed = PatchDraftSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    const existingDraft = await getDraft(draftId);
    if (!existingDraft) {
      return res.status(404).json({
        ok: false,
        error: 'draft_not_found',
        message: 'Draft store not found or expired',
      });
    }
    const draft = existingDraft;
    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DraftStore] PATCH /:draftId denied', {
          draftId,
          userId,
          tenantKey,
          ...draftOwnershipFieldsForLog(draft),
        });
      }
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this draft.',
      });
    }
    const { preview } = parsed.data;
    const patched = await patchDraftPreview(draftId, preview);
    return res.json({
      ok: true,
      draftId: patched.id,
      status: patched.status,
      preview: patched.preview,
      mode: patched.mode,
      input: patched.input,
      error: patched.error,
    });
  } catch (error) {
    if (error.message?.includes('not found') || error.message?.includes('expired') || error.message?.includes('committed')) {
      return res.status(400).json({
        ok: false,
        error: 'draft_invalid',
        message: error.message,
      });
    }
    console.error('[DraftStore] PATCH error:', error);
    next(error);
  }
});

/**
 * POST /api/draft-store/:draftId/repair-catalog
 * Remove template/fashion items from catalog (when TEMPLATE_CATALOG_LEAK detected).
 * Requires auth and draft ownership. Returns { ok, removedCount, remainingCount?, needRegeneration?, message? }.
 */
router.post('/:draftId/repair-catalog', requireAuth, async (req, res, next) => {
  try {
    const { draftId } = req.params;
    const existingDraft = await getDraft(draftId);
    if (!existingDraft) {
      return res.status(404).json({
        ok: false,
        error: 'draft_not_found',
        message: 'Draft store not found or expired',
      });
    }
    const draft = existingDraft;
    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DraftStore] POST /:draftId/repair-catalog denied', {
          draftId,
          userId,
          tenantKey,
          ...draftOwnershipFieldsForLog(draft),
        });
      }
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this draft.',
      });
    }
    const result = await repairCatalog(draftId);
    return res.json({
      ok: result.ok,
      removedCount: result.removedCount ?? 0,
      remainingCount: result.remainingCount,
      needRegeneration: result.needRegeneration,
      message: result.message,
    });
  } catch (error) {
    if (error.message?.includes('not found') || error.message?.includes('expired') || error.message?.includes('committed')) {
      return res.status(400).json({
        ok: false,
        error: 'draft_invalid',
        message: error.message,
      });
    }
    console.error('[DraftStore] repair-catalog error:', error);
    next(error);
  }
});

/**
 * GET /api/draft-store/:draftId
 * Get draft store preview data
 * 
 * Response (200):
 *   - ok: true
 *   - draftId: string
 *   - status: string
 *   - preview?: object
 *   - mode: string
 *   - input: object
 *   - error?: string
 */

router.get('/:draftId/summary', requireAuth, async (req, res, next) => {
  try {
    const draftId = req.params.draftId;
    const generationRunId = (req.query?.generationRunId && typeof req.query.generationRunId === 'string')
      ? req.query.generationRunId.trim()
      : null;
    const instanceId = getInstanceId();
    const database = getDatabasePathForLog();
    console.log('[DraftSummaryLookup]', { instanceId, draftId, generationRunId: generationRunId || undefined, database });
    let draft = await getDraft(draftId);
    if (!draft && generationRunId) {
      draft = await getDraftByGenerationRunId(generationRunId).catch(() => null);
      if (draft && process.env.NODE_ENV !== 'production') {
        console.log('[DraftSummaryLookup] resolved by generationRunId', { draftId, generationRunId, resolvedId: draft.id });
      }
    }
    if (!draft) {
      console.warn('[DraftSummaryLookup] not_found', { instanceId, draftId, database });
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Draft store not found or expired' });
    }
    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    // Safe backfill: set ownerUserId when tenant matches so old drafts become accessible without relaxing access
    const draftTenantId = draft.input && typeof draft.input === 'object' ? draft.input.tenantId : undefined;
    if (draft.ownerUserId == null && draftTenantId != null && draftTenantId === tenantKey && req.user?.id) {
      await prisma.draftStore.update({
        where: { id: draftId },
        data: { ownerUserId: req.user.id },
      }).catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[DraftStore] backfill ownerUserId failed', { draftId, err: err?.message || err });
        }
      });
      draft = { ...draft, ownerUserId: req.user.id };
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DraftStore] backfilled ownerUserId', { draftId, ownerUserId: req.user.id });
      }
    }
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      const logFields = draftOwnershipFieldsForLog(draft);
      console.log('[DraftStore] GET /:draftId/summary 403', {
        draftId,
        userId,
        tenantKey,
        draftOwnerUserId: logFields.draftOwnerUserId,
        draftTenantKey: logFields.draftTenantKey,
        storeId: logFields.storeId,
        generationRunId: logFields.generationRunId,
      });
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'You do not have access to this draft.' });
    }
    const rawPreview = draft.preview;
    const preview = (rawPreview && typeof rawPreview === 'object')
      ? rawPreview
      : (typeof rawPreview === 'string' ? (() => { try { return JSON.parse(rawPreview); } catch { return {}; } })() : {});
    const items = Array.isArray(preview?.items) ? preview.items : (Array.isArray(preview?.products) ? preview.products : []);
    const categories = Array.isArray(preview.categories) ? preview.categories : [];
    const heroImageUrl = preview.hero?.imageUrl ?? preview.hero?.url ?? null;
    let missingImagesCount = 0;
    if (Array.isArray(items)) {
      missingImagesCount = items.filter((it) => !(it?.imageUrl ?? it?.image ?? it?.photo)).length;
    }
    return res.json({
      ok: true,
      draftStoreId: draft.id,
      status: draft.status,
      businessName: preview.storeName ?? preview.meta?.storeName ?? (draft.input && typeof draft.input === 'object' ? draft.input.businessName : null) ?? 'New Store',
      category: preview.storeType ?? preview.meta?.storeType ?? (draft.input && typeof draft.input === 'object' ? draft.input.category : null) ?? 'general',
      productCount: items.length,
      categoryCount: categories.length,
      imageCount: Array.isArray(items) ? items.filter((it) => it?.imageUrl ?? it?.image ?? it?.photo).length : 0,
      heroImageUrl: heroImageUrl || undefined,
      missingImagesCount: missingImagesCount || undefined,
      updatedAt: draft.updatedAt?.toISOString?.() ?? new Date(draft.updatedAt).toISOString(),
    });
  } catch (err) {
    console.error('[DraftStore] GET /:draftId/summary error:', err);
    next(err);
  }
});

/**
 * POST /api/draft-store/:draftId/generate
 * Phase 0: run generation for an existing draft. requireAuth; owner only. Sync up to 60s then return.
 */
router.post('/:draftId/generate', requireAuth, async (req, res, next) => {
  try {
    const draftId = req.params.draftId;
    const draft = await getDraft(draftId);
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Draft store not found or expired' });
    }
    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DraftStore] POST /:draftId/generate denied', {
          draftId,
          userId,
          tenantKey,
          ...draftOwnershipFieldsForLog(draft),
        });
      }
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'You do not have access to this draft.' });
    }
    if (draft.status === 'ready') {
      return res.json({ ok: true, draftStoreId: draft.id, status: 'ready', message: 'Already generated.' });
    }
    if (draft.status === 'generating') {
      return res.status(202).json({
        ok: true,
        draftStoreId: draft.id,
        status: 'generating',
        message: 'Generation already in progress. Poll GET /:draftStoreId/summary.',
      });
    }
    await generateDraft(draftId, { userId: req.userId ?? null });
    const updated = await getDraft(draftId);
    return res.json({
      ok: true,
      draftStoreId: draftId,
      status: updated?.status ?? 'ready',
    });
  } catch (err) {
    if (err?.code === 'AUTH_REQUIRED_FOR_AI') {
      return res.status(401).json({ ok: false, code: err.code, message: err.message || 'Authentication required' });
    }
    if (err?.code === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({ ok: false, code: err.code, message: err.message || 'Insufficient credits' });
    }
    console.error('[DraftStore] POST /:draftId/generate error:', err);
    next(err);
  }
});

router.get('/:draftId', requireAuth, async (req, res, next) => {
  try {
    const { draftId } = req.params;
    const draft = await getDraft(draftId);

    if (!draft) {
      return res.status(404).json({
        ok: false,
        error: 'draft_not_found',
        message: 'Draft store not found or expired',
      });
    }

    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DraftStore] GET /:draftId denied', {
          draftId,
          userId,
          tenantKey,
          ...draftOwnershipFieldsForLog(draft),
        });
      }
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this draft.',
      });
    }

    // If draft is committed, return redirect info instead of preview
    if (draft.status === 'committed') {
      return res.json({
        ok: true,
        draftId: draft.id,
        status: 'committed',
        redirectTo: '/app/back',
        message: 'Draft already saved. Opening your store...',
      });
    }

    // Return same shape as GET /api/stores/temp/draft so frontend normalizer gets products/categories and does not overwrite good state
    const preview = typeof draft.preview === 'string' ? JSON.parse(draft.preview) : (draft.preview || {});
    const products = (Array.isArray(preview.items) ? preview.items : preview.products || []).map((item) => ({
      ...item,
      description: item?.description ?? null,
    }));
    const categories = Array.isArray(preview.categories) ? preview.categories : [];
    const store = {
      id: 'temp',
      name: preview.storeName || preview.meta?.storeName || 'Untitled Store',
      type: preview.storeType || preview.meta?.storeType || 'General',
    };

    res.json({
      ok: true,
      draftId: draft.id,
      status: draft.status,
      store,
      products,
      categories,
      preview: draft.preview,
      mode: draft.mode,
      input: draft.input,
      error: draft.error,
    });
  } catch (error) {
    console.error('[DraftStore] Get error:', error);
    next(error);
  }
});

/**
 * POST /api/draft-store/:draftId/commit
 * Commit draft store to a real store. Supports (1) authenticated commit (Bearer token, acceptTerms only) and (2) legacy email+password signup-and-commit.
 * Publish gating: when auth is required and not present, returns 401 AUTH_REQUIRED; when email verification is enforced and not verified, returns 403 EMAIL_NOT_VERIFIED.
 */
router.post('/:draftId/commit', optionalAuth, async (req, res, next) => {
  try {
    const { draftId } = req.params;

    console.log(`[DraftCommit] POST /api/draft-store/${draftId}/commit`);

    if (!checkRateLimit(req)) {
      return res.status(429).json({
        ok: false,
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again in a minute.',
      });
    }

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_request_body',
        message: 'Request body must be a JSON object with acceptTerms and, when not authenticated, email and password',
      });
    }

    const isAuthed = !!req.userId && req.user?.role !== 'guest';
    const publishRequiresAuth = process.env.PUBLISH_REQUIRES_AUTH === 'true' || process.env.PUBLISH_REQUIRES_AUTH === '1';
    const enforceEmailVerification = process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';

    if (publishRequiresAuth && !isAuthed) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_REQUIRED',
        message: 'You must be signed in to publish. Please log in or register first.',
      });
    }

    if (isAuthed && enforceEmailVerification) {
      const superAdminBypass = isSuperAdmin(req) &&
        (process.env.NODE_ENV !== 'production' || process.env.PROD_OVERRIDE === 'true');
      if (!superAdminBypass) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { email: true, emailVerified: true },
        });
        if (user && !user.emailVerified) {
          return res.status(403).json({
            ok: false,
            code: 'EMAIL_NOT_VERIFIED',
            email: user.email,
            message: 'Please verify your email before publishing.',
          });
        }
      }
    }

    if (isAuthed) {
      const acceptTerms = req.body.acceptTerms === true;
      if (!acceptTerms) {
        return res.status(400).json({
          ok: false,
          error: 'accept_terms_required',
          message: 'Terms of service must be accepted',
        });
      }
      const businessName = req.body.businessName;
      const businessType = req.body.businessType;
      const location = req.body.location;
      const result = await commitDraft(draftId, {
        userId: req.userId,
        acceptTerms: true,
        businessFields: { name: businessName, type: businessType, location },
      });
      if (result.token) {
        res.cookie('token', result.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
      }
      return res.json({
        ok: true,
        userId: result.userId,
        businessId: result.businessId,
        storeId: result.storeId,
        storeSlug: result.storeSlug,
        itemsCreated: result.itemsCreated,
        token: result.token,
        redirectTo: result.redirectTo,
        alreadyCommitted: result.alreadyCommitted || false,
      });
    }

    const validationResult = CommitDraftSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    const { email, password, name, acceptTerms, businessName, businessType, location } = validationResult.data;

    const result = await commitDraft(draftId, {
      email,
      password,
      name,
      acceptTerms,
      businessFields: {
        name: businessName,
        type: businessType,
        location,
      },
    });

    // Set auth cookie for immediate login
    if (result.token) {
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    // Return response with token and redirect info
    res.json({
      ok: true,
      userId: result.userId,
      businessId: result.businessId,
      storeId: result.storeId,
      storeSlug: result.storeSlug,
      itemsCreated: result.itemsCreated,
      token: result.token, // JWT token for client-side auth
      redirectTo: result.redirectTo, // Redirect path for frontend
      alreadyCommitted: result.alreadyCommitted || false, // Flag for idempotent commits
    });
  } catch (error) {
    console.error('[DraftStore] Commit error:', error);
    
    // Handle specific errors
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        ok: false,
        error: 'email_already_exists',
        message: error.message,
      });
    }
    
    // Note: "already been committed" is now handled idempotently in commitDraft,
    // so this error should not occur, but keep for safety
    if (error.message.includes('already been committed')) {
      // Try to return existing data idempotently
      try {
        const draft = await getDraft(draftId);
        if (draft && draft.status === 'committed' && draft.committedStoreId) {
          const business = await prisma.business.findUnique({
            where: { id: draft.committedStoreId },
          });
          if (business) {
            const { generateToken } = await import('../middleware/auth.js');
            const token = generateToken(draft.committedUserId);
            return res.json({
              ok: true,
              userId: draft.committedUserId,
              businessId: business.id,
              storeId: business.id,
              storeSlug: business.slug,
              itemsCreated: 0,
              token,
              redirectTo: '/app/back',
            });
          }
        }
      } catch (idempotentError) {
        // Fall through to error response
      }
      return res.status(409).json({
        ok: false,
        error: 'draft_already_committed',
        message: error.message,
      });
    }
    
    if (error.message.includes('abandoned')) {
      return res.status(409).json({
        ok: false,
        error: 'draft_abandoned',
        message: error.message,
      });
    }
    
    if (error.message.includes('expired') || error.message.includes('not ready')) {
      return res.status(400).json({
        ok: false,
        error: 'draft_invalid',
        message: error.message,
      });
    }

    res.status(500).json({
      ok: false,
      error: 'commit_failed',
      message: error.message || 'Failed to commit draft store',
    });
  }
});

export default router;
