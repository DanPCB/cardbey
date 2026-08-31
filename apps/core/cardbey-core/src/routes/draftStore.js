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
import { hasRole, isPlatformAdmin } from '../lib/authorization.js';
import { createDraft, createDraftStoreForUser, generateDraft, getDraft, getDraftByGenerationRunId, commitDraft, patchDraftPreview, normalizePreviewCategories, repairCatalog } from '../services/draftStore/draftStoreService.js';
import { buildDraftPublishState } from '../services/draftStore/buildDraftPublishState.js';
import { isDraftOwnedByUser, canAccessDraftStore, draftOwnershipFieldsForLog } from '../lib/draftOwnership.js';
import { getTenantId } from '../lib/tenant.js';

/** Super admin can access any draft/store; used for ownership bypass only. */
function isSuperAdmin(req) {
  return !!req.user && hasRole(req.user, 'super_admin');
}
import { resolveDraftForStore } from '../lib/draftResolver.js';
import { slugify } from '../utils/slug.js';
import { publishDraft, PublishDraftError } from '../services/draftStore/publishDraftService.js';
import { assertUiWriteAuthority } from '../lib/runtime/performerRuntime/uiWriteAuthorityGuard.js';
import { wrapHybridRoute } from '../lib/routing/wrapHybridRoute.js';
import {
  ensurePublishSnapshot,
  getPublishSnapshot,
  patchPublishSnapshot,
  verifyPublishIdentity,
  verifyPublishedStoreRoute,
  snapshotToPreviewShape,
  isPublishSnapshotV1Enabled,
  PublishSnapshotError,
} from '../services/draftStore/publishSnapshotService.js';
import { restoreDraftFromPublished } from '../services/draftStore/restoreDraftFromPublished.js';
import { enforcePublishHeroCanonical } from '../services/draftStore/heroPublishInvariant.js';
import {
  heroAssetUploadSingle,
  resolveDraftForHeroUpload,
  executeHeroAssetUpload,
} from '../services/draftStore/heroAssetUpload.js';

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
 * GET /api/draft-store/mine
 * List unpublished DraftStores the current user/guest can access (selector + My Stores).
 * Registered before /:draftId so "mine" is not treated as an id.
 */
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId ?? req.user?.id ?? null;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Sign in required' });
    }

    const prisma = getPrismaClient();
    const owned = await prisma.draftStore.findMany({
      where: {
        committedAt: null,
        status: { notIn: ['committed', 'abandoned'] },
        OR: [
          { ownerUserId: userId },
          ...(String(userId).startsWith('guest_')
            ? [{ guestSessionId: String(userId).replace(/^guest_/, '') }, { guestSessionId: userId }]
            : []),
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        committedAt: true,
        committedStoreId: true,
        generationRunId: true,
        preview: true,
        input: true,
        updatedAt: true,
      },
    });

    // Also include drafts linked from Store Missions owned by this actor
    const missions = await prisma.missionPipeline.findMany({
      where: {
        type: 'store',
        createdBy: userId,
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: { id: true, outputsJson: true, metadataJson: true },
    });
    const missionDraftIds = [];
    for (const m of missions) {
      const out = m.outputsJson && typeof m.outputsJson === 'object' ? m.outputsJson : {};
      const did = typeof out.draftId === 'string' ? out.draftId.trim() : '';
      if (did) missionDraftIds.push(did);
    }
    const missingIds = missionDraftIds.filter((id) => !owned.some((d) => d.id === id));
    let fromMissions = [];
    if (missingIds.length) {
      fromMissions = await prisma.draftStore.findMany({
        where: {
          id: { in: missingIds },
          committedAt: null,
          status: { notIn: ['committed', 'abandoned'] },
        },
        select: {
          id: true,
          status: true,
          committedAt: true,
          committedStoreId: true,
          generationRunId: true,
          preview: true,
          input: true,
          updatedAt: true,
        },
      });
    }

    const rows = [...owned, ...fromMissions];
    const seen = new Set();
    const drafts = [];
    for (const d of rows) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const allowed = await canAccessDraftStore(d, {
        userId,
        tenantKey: getTenantId(req.user) ?? userId,
        isSuperAdmin: isSuperAdmin(req),
      });
      if (!allowed) continue;
      const preview =
        d.preview && typeof d.preview === 'object'
          ? d.preview
          : typeof d.preview === 'string'
            ? (() => {
                try {
                  return JSON.parse(d.preview);
                } catch {
                  return {};
                }
              })()
            : {};
      const input =
        d.input && typeof d.input === 'object' && !Array.isArray(d.input) ? d.input : {};
      const name =
        preview.storeName ||
        preview.meta?.storeName ||
        input.businessName ||
        'Untitled draft';
      const generationRunId =
        (d.generationRunId && String(d.generationRunId).trim()) ||
        (typeof input.generationRunId === 'string' && input.generationRunId.trim()) ||
        null;
      drafts.push({
        draftId: d.id,
        storeId: d.committedStoreId || input.storeId || preview.meta?.storeId || null,
        name: String(name),
        businessType: input.businessType || input.storeType || preview.storeType || null,
        location: input.location || null,
        status: d.status,
        published: false,
        committed: false,
        generationRunId,
        updatedAt: d.updatedAt,
      });
    }

    return res.json({ ok: true, drafts });
  } catch (err) {
    console.error('[DraftStore] GET /mine error:', err);
    next(err);
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
    const { draftId, generationRunId } = req.body || {};
    const runId =
      typeof generationRunId === 'string' && generationRunId.trim() ? generationRunId.trim() : null;

    if (runId) {
      const { getDraftByGenerationRunId } = await import('../services/draftStore/draftStoreService.js');
      const draft = await getDraftByGenerationRunId(runId);
      if (!draft) {
        return res.status(404).json({
          ok: false,
          error: 'draft_not_found',
          message: 'Draft not found for this generation run.',
        });
      }
      if (draft.ownerUserId && draft.ownerUserId !== req.userId) {
        return res.status(403).json({
          ok: false,
          error: 'forbidden',
          message: 'You do not have access to this draft.',
        });
      }
      await prisma.draftStore.update({
        where: { id: draft.id },
        data: { ownerUserId: req.userId },
      });
      return res.json({
        ok: true,
        claimedCount: 1,
        draftIds: [draft.id],
        storeId: draft.committedStoreId ?? null,
      });
    }

    const guestSessionIdValue = req.guestSessionId || (req.headers['x-guest-session'] && req.headers['x-guest-session'].trim());
    if (!guestSessionIdValue) {
      return res.status(400).json({
        ok: false,
        error: 'guest_session_required',
        message: 'Guest session ID required (cookie guestSessionId or header X-Guest-Session), or pass generationRunId.',
      });
    }
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

const PublishSnapshotPatchSchema = z.object({
  catalog: z
    .object({
      products: z.array(z.record(z.unknown())).optional(),
      categories: z.array(z.record(z.unknown())).optional(),
    })
    .optional(),
  hero: z.record(z.unknown()).optional(),
  theme: z.record(z.unknown()).optional(),
  website: z.record(z.unknown()).optional(),
  media: z.record(z.unknown()).optional(),
  name: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
  expectedSnapshotVersion: z.number().int().optional(),
});

const PublishFromSnapshotSchema = z.object({
  expectedSourceFingerprint: z.string().min(1),
  expectedSnapshotVersion: z.number().int().positive(),
  expectedDraftId: z.string().min(1),
  expectedGenerationRunId: z.string().optional(),
  storeId: z.string().optional(),
});

async function assertDraftAccess(req, draft) {
  const userId = req.userId ?? req.user?.id ?? null;
  const tenantKey = getTenantId(req.user) ?? userId ?? null;
  const allowed = await canAccessDraftStore(draft, {
    userId,
    tenantKey,
    isSuperAdmin: isSuperAdmin(req),
  });
  if (!allowed) {
    return {
      status: 403,
      body: {
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this draft.',
      },
    };
  }
  return null;
}

/**
 * GET /api/draft-store/:draftId/publish-snapshot
 */
router.get('/:draftId/publish-snapshot', requireAuth, async (req, res, next) => {
  try {
    if (!isPublishSnapshotV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'publish_snapshot_disabled',
        message: 'Publish snapshot API is disabled. Set PUBLISH_SNAPSHOT_V1=true to enable.',
      });
    }
    const { draftId } = req.params;
    const draft = await getDraft(draftId);
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'draft_not_found', message: 'Draft not found' });
    }
    const denied = await assertDraftAccess(req, draft);
    if (denied) return res.status(denied.status).json(denied.body);

    const { snapshot, version, migrated } = await ensurePublishSnapshot(prisma, draftId);
    return res.json({
      ok: true,
      snapshot,
      snapshotVersion: version,
      migrated,
      draftIdentity: {
        draftId: snapshot.draftId,
        generationRunId: snapshot.generationRunId ?? null,
        missionId: snapshot.missionId ?? null,
        storeId: snapshot.storeId ?? null,
        publishSourceId: snapshot.publishSourceId,
        sourceFingerprint: snapshot.sourceFingerprint,
        catalogVersion: snapshot.catalogVersion,
        previewVersion: snapshot.previewVersion,
      },
    });
  } catch (err) {
    if (err instanceof PublishSnapshotError) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    next(err);
  }
});


/**
 * PATCH /api/draft-store/:draftId/publish-snapshot
 */
router.patch('/:draftId/publish-snapshot', requireAuth, async (req, res, next) => {
  try {
    if (!isPublishSnapshotV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'publish_snapshot_disabled',
        message: 'Publish snapshot API is disabled.',
      });
    }
    const { draftId } = req.params;
    const parsed = PublishSnapshotPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    const draft = await getDraft(draftId);
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'draft_not_found', message: 'Draft not found' });
    }
    const denied = await assertDraftAccess(req, draft);
    if (denied) return res.status(denied.status).json(denied.body);

    const { expectedSnapshotVersion, ...patch } = parsed.data;
    const { snapshot, version } = await patchPublishSnapshot(prisma, draftId, patch, {
      expectedVersion: expectedSnapshotVersion,
    });
    return res.json({ ok: true, snapshot, snapshotVersion: version });
  } catch (err) {
    if (err instanceof PublishSnapshotError) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/draft-store/:draftId/publish — publish ONLY from stored publish snapshot.
 */
router.post('/:draftId/publish', requireAuth, wrapHybridRoute(async (req, res, next) => {
  try {
    assertUiWriteAuthority(req, {
      mutationType: 'publish_store',
      route: 'POST /api/draft-store/:draftId/publish',
      userId: req.userId ?? req.user?.id ?? null,
      missionId: req.body?.missionId ?? null,
      source: 'ui_publish',
    });
    const {
      guardPhaseFDraftStoreRunway,
      extractMissionIdFromDraftRequest,
    } = await import('../lib/broker/phaseFBypassGuards.js');
    const runwayGuard = guardPhaseFDraftStoreRunway({
      route: 'POST /:draftId/publish',
      draftId: req.params?.draftId ?? null,
      missionId: extractMissionIdFromDraftRequest(req),
      action: 'publish',
    });
    if (runwayGuard.blocked) {
      return res.status(403).json({
        ok: false,
        error: runwayGuard.code,
        message: runwayGuard.message,
      });
    }

    if (!isPublishSnapshotV1Enabled()) {
      console.warn('[DraftStore] POST /:draftId/publish called while PUBLISH_SNAPSHOT_V1 is disabled — use POST /api/store/publish');
      return res.status(503).json({
        ok: false,
        error: 'publish_snapshot_disabled',
        message: 'Use legacy POST /api/store/publish or enable PUBLISH_SNAPSHOT_V1.',
      });
    }
    const { draftId } = req.params;
    const parsed = PublishFromSnapshotSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    const draft = await getDraft(draftId);
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'draft_not_found', message: 'Draft not found' });
    }
    const denied = await assertDraftAccess(req, draft);
    if (denied) return res.status(denied.status).json(denied.body);

    const body = parsed.data;
    if (body.expectedDraftId !== draftId) {
      return res.status(409).json({
        ok: false,
        error: 'publish_identity_mismatch',
        message: 'expectedDraftId does not match route draftId.',
      });
    }

    const { snapshot } = await getPublishSnapshot(prisma, draftId);
    verifyPublishIdentity(snapshot, {
      expectedDraftId: body.expectedDraftId,
      expectedGenerationRunId: body.expectedGenerationRunId,
      expectedSnapshotVersion: body.expectedSnapshotVersion,
      expectedSourceFingerprint: body.expectedSourceFingerprint,
    });

    try {
      const { buildSourceFingerprintFromCatalog } = await import(
        '../services/draftStore/publishSnapshotFingerprint.js'
      );
      const previewRaw =
        typeof draft.preview === 'string'
          ? (() => {
              try {
                return JSON.parse(draft.preview);
              } catch {
                return {};
              }
            })()
          : draft.preview || {};
      const previewProducts = Array.isArray(previewRaw?.items)
        ? previewRaw.items
        : Array.isArray(previewRaw?.catalog?.products)
          ? previewRaw.catalog.products
          : [];
      const previewHash = buildSourceFingerprintFromCatalog(previewProducts);
      const snapProducts = snapshot.catalog?.products ?? [];
      const snapFirstNames = snapProducts
        .map((p) => (typeof p?.name === 'string' ? p.name.trim() : ''))
        .filter(Boolean)
        .slice(0, 5);
      console.log('[PUBLISH_SOURCE_CHECK]', {
        draftId,
        draftStorePreviewHash: previewHash,
        publishSnapshotHash: snapshot.sourceFingerprint,
        publishPayloadHash: snapshot.sourceFingerprint,
        catalogCount: snapProducts.length,
        firstNames: snapFirstNames,
      });
    } catch (logErr) {
      console.warn('[PUBLISH_SOURCE_CHECK] log_failed', logErr?.message || logErr);
    }

    const previewRawForHero =
      typeof draft.preview === 'string'
        ? (() => {
            try {
              return JSON.parse(draft.preview);
            } catch {
              return {};
            }
          })()
        : draft.preview || {};
    enforcePublishHeroCanonical(previewRawForHero, { source: 'draft_store_publish_draft_preview' });
    const legacyPreviewOverride = snapshotToPreviewShape(snapshot);
    if (previewRawForHero.heroVideoUrl || previewRawForHero.heroMediaType === 'video') {
      legacyPreviewOverride.heroVideoUrl = previewRawForHero.heroVideoUrl;
      legacyPreviewOverride.heroVideo = previewRawForHero.heroVideo;
      legacyPreviewOverride.heroMediaType = previewRawForHero.heroMediaType;
      legacyPreviewOverride.heroPosterUrl = previewRawForHero.heroPosterUrl;
      legacyPreviewOverride.heroPoster = previewRawForHero.heroPoster;
      if (previewRawForHero.hero && typeof previewRawForHero.hero === 'object') {
        legacyPreviewOverride.hero = { ...previewRawForHero.hero };
      }
    }
    enforcePublishHeroCanonical(legacyPreviewOverride, { source: 'draft_store_publish_snapshot' });

    // Phase 8B — optional projection publish snapshot (this entrypoint only; fail closed → legacy)
    const publishStartedAtMs = Date.now();
    let previewOverride = legacyPreviewOverride;
    /** @type {{ primarySource: string, reason: string, provenance: object|null, authoritative: boolean, projectionFingerprint?: string|null, publishDurationMs?: number }} */
    let publishCutover = {
      primarySource: 'legacy',
      reason: 'publish_cutover_disabled',
      provenance: null,
      authoritative: false,
    };
    try {
      const { prepareDraftStorePublishOverride } = await import(
        '../lib/storefrontDesignLibrary/publishCutover/index.js'
      );
      publishCutover = prepareDraftStorePublishOverride({
        draft,
        legacyPreview: legacyPreviewOverride,
        startedAtMs: publishStartedAtMs,
      });
      previewOverride = publishCutover.previewOverride || legacyPreviewOverride;
    } catch (cutoverErr) {
      console.warn(
        '[DraftStore] publish cutover prepare failed — using legacy snapshot:',
        cutoverErr?.message || cutoverErr,
      );
      previewOverride = legacyPreviewOverride;
      publishCutover = {
        primarySource: 'legacy',
        reason: 'legacy_fallback',
        provenance: null,
        authoritative: false,
      };
    }

    const storeId =
      body.storeId && typeof body.storeId === 'string' && body.storeId.trim()
        ? body.storeId.trim()
        : snapshot.storeId && snapshot.storeId !== 'temp'
          ? snapshot.storeId
          : 'temp';

    const result = await publishDraft(prisma, {
      storeId,
      draftId,
      generationRunId: body.expectedGenerationRunId || snapshot.generationRunId,
      userId: req.userId,
      entrypoint: 'draft_store_publish_snapshot',
      canonicalPreviewOverride: previewOverride,
      expectedStoreId:
        storeId && storeId !== 'temp' ? storeId : snapshot.storeId && snapshot.storeId !== 'temp' ? snapshot.storeId : undefined,
    });

    try {
      const { finalizePublishCutoverTelemetry } = await import(
        '../lib/storefrontDesignLibrary/publishCutover/index.js'
      );
      finalizePublishCutoverTelemetry(publishCutover, {
        draftId,
        storeId: result.storeId,
        startedAtMs: publishStartedAtMs,
      });
    } catch {
      /* non-fatal */
    }

    const verified = await verifyPublishedStoreRoute(prisma, {
      slug: result.slug,
      storeId: result.storeId,
      expectedFingerprint: snapshot.sourceFingerprint,
    });

    return res.status(200).json({
      ok: true,
      storeId: result.storeId,
      slug: verified.slug,
      publishedFingerprint: snapshot.sourceFingerprint,
      publishedSnapshotVersion: snapshot.version,
      liveUrl: verified.liveUrl,
      storefrontUrl: verified.liveUrl,
      publishedStoreId: result.storeId,
      publishSource: publishCutover.primarySource || 'legacy',
      publishSourceReason: publishCutover.reason || null,
      designLibraryPublish: publishCutover.provenance || previewOverride?.meta?.designLibraryPublish || null,
      authoritative: false,
    });
  } catch (err) {
    if (err instanceof PublishSnapshotError) {
      return res.status(err.statusCode).json({ ok: false, error: err.code, message: err.message });
    }
    if (err instanceof PublishDraftError) {
      return res.status(err.statusCode || 500).json({
        ok: false,
        error: err.code,
        message: err.message,
      });
    }
    next(err);
  }
}, { operation: 'publish_draft' }));

/**
 * POST /api/draft-store/:draftId/upload/hero
 * Multipart field "file". Query: generationRunId? (optional, for runway/temp resolution).
 */
router.post('/:draftId/upload/hero', requireAuth, heroAssetUploadSingle, async (req, res, next) => {
  try {
    assertUiWriteAuthority(req, {
      mutationType: 'hero_upload',
      route: 'POST /api/draft-store/:draftId/upload/hero',
      userId: req.userId ?? req.user?.id ?? null,
      missionId: req.body?.missionId ?? req.query?.missionId ?? null,
      source: 'ui_hero_upload',
    });
    const draftId = String(req.params.draftId ?? '').trim();
    const generationRunId =
      typeof req.query.generationRunId === 'string' ? req.query.generationRunId.trim() : '';
    const resolved = await resolveDraftForHeroUpload({
      userId: req.userId,
      user: req.user,
      draftId,
      generationRunId,
      routeStoreId: null,
    });
    if (resolved.errorResponse) {
      return res.status(resolved.errorResponse.status).json(resolved.errorResponse.body);
    }
    return await executeHeroAssetUpload(req, res, {
      draft: resolved.draft,
      routeStoreId: resolved.draft?.committedStoreId ?? null,
    });
  } catch (err) {
    console.error('[draftStore] POST /:draftId/upload/hero error:', err?.message || err);
    next(err);
  }
});


/**
 * POST /api/draft-store/:draftId/restore-from-published
 * Reset editable draft preview to match the live published Business.
 * Does not republish. Requires auth + draft access; draft must have committedStoreId.
 */
router.post('/:draftId/restore-from-published', requireAuth, async (req, res, next) => {
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
    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(existingDraft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this draft.',
      });
    }
    const result = await restoreDraftFromPublished(prisma, { draftId });
    return res.json({
      ok: true,
      draftId: result.draftId,
      status: result.status,
      preview: result.preview,
      publishState: result.publishState,
    });
  } catch (error) {
    const code = error?.code;
    const status = error?.statusCode || 500;
    if (
      code === 'store_not_found' ||
      code === 'draft_not_found' ||
      code === 'store_not_live' ||
      code === 'draft_not_committed'
    ) {
      return res.status(status).json({ ok: false, error: code, message: error.message });
    }
    console.error('[DraftStore] POST /:draftId/restore-from-published error:', error);
    next(error);
  }
});

/**
 * POST /api/draft-store/:draftId/restore-from-published
 * Reset editable draft preview to match the live published Business.
 * Does not republish. Requires auth + draft access; draft must have committedStoreId.
 */
router.post('/:draftId/restore-from-published', requireAuth, async (req, res, next) => {
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
    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(existingDraft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this draft.',
      });
    }
    const result = await restoreDraftFromPublished(prisma, { draftId });
    return res.json({
      ok: true,
      draftId: result.draftId,
      status: result.status,
      preview: result.preview,
      publishState: result.publishState,
    });
  } catch (error) {
    const code = error?.code;
    const status = error?.statusCode || 500;
    if (
      code === 'store_not_found' ||
      code === 'draft_not_found' ||
      code === 'store_not_live' ||
      code === 'draft_not_committed'
    ) {
      return res.status(status).json({ ok: false, error: code, message: error.message });
    }
    console.error('[DraftStore] POST /:draftId/restore-from-published error:', error);
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
    const { assertLegacyUploadAuthority } = await import('../lib/runtime/performerRuntime/runtimeUploadAuthority.js');
    assertLegacyUploadAuthority(req, {
      mutationType: 'draft_preview_patch',
      route: 'PATCH /api/draft-store/:draftId',
      userId: req.userId ?? req.user?.id ?? null,
      missionId: req.body?.missionId ?? null,
      source: 'ui_draft_save',
      deprecatedHint:
        'Direct draft PATCH — use POST /api/performer/runtime/ui-action with action=save_draft_preview',
    });
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
    const {
      guardPhaseFDraftStoreRunway,
      extractMissionIdFromDraftRequest,
    } = await import('../lib/broker/phaseFBypassGuards.js');
    const runwayGuard = guardPhaseFDraftStoreRunway({
      route: 'POST /:draftId/generate',
      draftId: req.params?.draftId ?? null,
      missionId: extractMissionIdFromDraftRequest(req),
      action: 'generate',
    });
    if (runwayGuard.blocked) {
      return res.status(403).json({
        ok: false,
        error: runwayGuard.code,
        message: runwayGuard.message,
      });
    }

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

/**
 * Phase 6/8A — authorised projection preview (advisory only).
 * GET /api/draft-store/:draftId/projection-preview
 * Does not replace the public storefront; requires preview flag + owner/admin access.
 * Phase 8A-Core: dual packages + honest primarySource (legacy | projection).
 */
router.get('/:draftId/projection-preview', requireAuth, async (req, res, next) => {
  try {
    const { canAccessProjectionPreview } = await import(
      '../lib/storefrontDesignLibrary/rendering/index.js'
    );
    const {
      isDesignLibraryV1Enabled,
      isStorefrontProjectionPreviewEnabled,
    } = await import('../lib/storefrontDesignLibrary/flags.js');
    const { buildPreviewRenderPayload } = await import(
      '../lib/storefrontDesignLibrary/previewRendering/index.js'
    );
    const { catalogFromDraft } = await import('../lib/storefrontDesignLibrary/acceptance/index.js');

    if (!isDesignLibraryV1Enabled() || !isStorefrontProjectionPreviewEnabled()) {
      return res.status(404).json({
        ok: false,
        error: 'projection_preview_disabled',
        message: 'Projection preview is not enabled',
      });
    }

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
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Draft access denied' });
    }

    const actor = {
      userId,
      role: req.user?.role,
      roles: req.user?.roles,
      isOwner: Boolean(draft.ownerUserId && userId && draft.ownerUserId === userId),
    };
    if (
      !canAccessProjectionPreview(actor, { ownerUserId: draft.ownerUserId }) &&
      !isSuperAdmin(req)
    ) {
      return res.status(403).json({
        ok: false,
        error: 'projection_preview_forbidden',
        message: 'Projection preview requires owner or admin access',
      });
    }

    const catalog = catalogFromDraft(draft);
    if (!catalog.meta?.designLibraryStorefrontProjection && draft.preview?.meta?.designLibraryStorefrontProjection) {
      catalog.meta = { ...catalog.meta, ...draft.preview.meta };
    }

    const legacyStore = {
      products: catalog.products,
      preview: draft.preview,
      meta: catalog.meta,
      primaryCTA: catalog.meta?.primaryCTA ?? draft.preview?.primaryCTA,
      websiteTemplateId: draft.websiteTemplateId ?? draft.preview?.websiteTemplateId,
      contentTemplateId: draft.contentTemplateId ?? draft.preview?.contentTemplateId,
      theme: draft.preview?.website?.theme,
    };

    const payload = buildPreviewRenderPayload({
      catalog,
      legacyStore,
      previewMode: true,
      context: {
        phone: draft.preview?.phone ?? draft.input?.phone,
        bookingUrl: draft.preview?.bookingUrl,
        businessName: draft.input?.businessName,
        legacyStore,
      },
    });

    if (!payload.ok || !payload.primaryPackage) {
      return res.status(422).json({
        ok: false,
        error: 'projection_preview_unavailable',
        message: 'Could not build preview packages',
        previewLabel: 'Preview — not live',
        authoritative: false,
        primarySource: 'legacy',
        reason: payload.reason ?? 'legacy_fallback',
      });
    }

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      ok: true,
      previewLabel: payload.previewLabel,
      authoritative: false,
      primarySource: payload.primarySource,
      reason: payload.reason,
      primaryPackage: payload.primaryPackage,
      packages: payload.packages,
      acceptance: payload.acceptance,
      // Honesty: viewModel only when primary is projection (never projection-only under legacy)
      viewModel: payload.viewModel,
      comparison: payload.comparison,
      // Phase 7 naming compat — same honesty rule as primarySource
      previewSource: payload.primarySource,
      acceptanceReason: payload.reason,
      robots: 'noindex',
    });
  } catch (err) {
    console.error('[DraftStore] GET /:draftId/projection-preview error:', err);
    next(err);
  }
});

/**
 * Phase 7 — Current vs Recommended comparison for owner/admin.
 * GET /api/draft-store/:draftId/projection-comparison
 */
router.get('/:draftId/projection-comparison', requireAuth, async (req, res, next) => {
  try {
    const { isStorefrontProjectionAcceptanceEnabled, isDesignLibraryV1Enabled } = await import(
      '../lib/storefrontDesignLibrary/flags.js'
    );
    const { canAccessProjectionPreview } = await import(
      '../lib/storefrontDesignLibrary/rendering/projectionPreviewAccess.js'
    );
    const { loadOwnerProjectionComparisonForDraft } = await import(
      '../lib/storefrontDesignLibrary/acceptance/index.js'
    );

    if (!isDesignLibraryV1Enabled() || !isStorefrontProjectionAcceptanceEnabled()) {
      return res.status(404).json({
        ok: false,
        error: 'projection_acceptance_disabled',
        message: 'Projection acceptance workflow is not enabled',
      });
    }

    const { draftId } = req.params;
    const draft = await getDraft(draftId);
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'draft_not_found' });
    }

    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const actor = {
      userId,
      role: req.user?.role,
      roles: req.user?.roles,
      isOwner: Boolean(draft.ownerUserId && userId && draft.ownerUserId === userId),
    };
    if (
      !canAccessProjectionPreview(actor, { ownerUserId: draft.ownerUserId }) &&
      !isSuperAdmin(req)
    ) {
      return res.status(403).json({ ok: false, error: 'projection_comparison_forbidden' });
    }

    const loaded = await loadOwnerProjectionComparisonForDraft(draftId, {});
    if (!loaded.ok) {
      return res.status(404).json({ ok: false, error: loaded.error });
    }

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.json({
      ok: true,
      authoritative: false,
      comparison: loaded.comparison,
      robots: 'noindex',
    });
  } catch (err) {
    console.error('[DraftStore] GET /:draftId/projection-comparison error:', err);
    next(err);
  }
});

/**
 * Phase 7 — Explicit accept/reject of recommended structure for this draft only.
 * POST /api/draft-store/:draftId/projection-acceptance
 * Body: { decision: 'accept'|'reject', confirm: true, applyToDraftPreview?: boolean, note?: string }
 */
router.post('/:draftId/projection-acceptance', requireAuth, async (req, res, next) => {
  try {
    const { isStorefrontProjectionAcceptanceEnabled, isDesignLibraryV1Enabled } = await import(
      '../lib/storefrontDesignLibrary/flags.js'
    );
    const { canAccessProjectionPreview } = await import(
      '../lib/storefrontDesignLibrary/rendering/projectionPreviewAccess.js'
    );
    const { persistProjectionAcceptanceDecision } = await import(
      '../lib/storefrontDesignLibrary/acceptance/index.js'
    );

    if (!isDesignLibraryV1Enabled() || !isStorefrontProjectionAcceptanceEnabled()) {
      return res.status(404).json({
        ok: false,
        error: 'projection_acceptance_disabled',
        message: 'Projection acceptance workflow is not enabled',
      });
    }

    const { draftId } = req.params;
    const draft = await getDraft(draftId);
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'draft_not_found' });
    }

    const userId = req.userId ?? req.user?.id ?? null;
    const tenantKey = getTenantId(req.user) ?? userId ?? null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      isSuperAdmin: isSuperAdmin(req),
    });
    if (!allowed) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const actor = {
      userId,
      role: req.user?.role,
      roles: req.user?.roles,
      isOwner: Boolean(draft.ownerUserId && userId && draft.ownerUserId === userId),
    };
    if (
      !canAccessProjectionPreview(actor, { ownerUserId: draft.ownerUserId }) &&
      !isSuperAdmin(req)
    ) {
      return res.status(403).json({ ok: false, error: 'projection_acceptance_forbidden' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await persistProjectionAcceptanceDecision(
      draftId,
      {
        decision: body.decision,
        confirm: body.confirm === true,
        applyToDraftPreview: body.applyToDraftPreview,
        note: body.note,
        actorUserId: userId,
      },
      {},
    );

    if (!result.ok) {
      const errors = Array.isArray(result.errors) ? result.errors : [];
      const message =
        errors.includes('not_safe_for_preview')
          ? 'Recommended structure is not safe for draft preview yet (readiness blockers). Keep Current, or fix blockers before accepting.'
          : errors.includes('projection_missing')
            ? 'No recommended projection is available on this draft.'
            : errors.includes('confirm_required')
              ? 'Explicit confirmation is required to accept or reject.'
              : errors.length
                ? `Acceptance rejected: ${errors.join(', ')}`
                : 'Acceptance rejected.';
      return res.status(422).json({
        ok: false,
        error: result.error,
        errors,
        message,
        readiness: result.comparison?.recommended?.readiness ?? null,
        authoritative: false,
      });
    }

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.json({
      ok: true,
      authoritative: false,
      acceptance: result.acceptance,
      comparison: result.comparison,
      message:
        result.acceptance.status === 'accepted'
          ? 'Recommended structure accepted for this draft preview only. Public storefront unchanged.'
          : 'Recommended structure rejected. Current structure kept.',
      robots: 'noindex',
    });
  } catch (err) {
    console.error('[DraftStore] POST /:draftId/projection-acceptance error:', err);
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
    const missionIdQuery =
      typeof req.query?.missionId === 'string' ? String(req.query.missionId).trim() : null;
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey,
      user: req.user,
      isSuperAdmin: isSuperAdmin(req),
      isPlatformAdmin: isPlatformAdmin(req.user),
      missionId: missionIdQuery || null,
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

    // Return same shape as GET /api/stores/temp/draft so frontend normalizer gets products/categories and does not overwrite good state
    const preview = typeof draft.preview === 'string' ? JSON.parse(draft.preview) : (draft.preview || {});
    const { readCanonicalHeroFromPreview } = await import('../services/draftStore/draftPreviewHeroSync.js');
    const { heroImage, heroVideo, isVideo } = readCanonicalHeroFromPreview(preview);
    const products = (Array.isArray(preview.items) ? preview.items : preview.products || []).map((item) => ({
      ...item,
      description: item?.description ?? null,
    }));
    const categories = Array.isArray(preview.categories) ? preview.categories : [];
    const committedStoreId =
      typeof draft.committedStoreId === 'string' && draft.committedStoreId.trim()
        ? draft.committedStoreId.trim()
        : null;
    const store = {
      id: committedStoreId || preview.meta?.storeId || 'temp',
      name: preview.storeName || preview.meta?.storeName || 'Untitled Store',
      type: preview.storeType || preview.meta?.storeType || 'General',
      ...(committedStoreId ? { committedStoreId } : {}),
    };
    const uiStatus =
      draft.status === 'generating'
        ? 'generating'
        : draft.status === 'committed' || draft.status === 'ready' || draft.status === 'draft'
          ? 'ready'
          : draft.status;

    /** Ephemeral Projection Renderer Cutover payload — never persisted on draft. */
    let storefrontRender = null;
    try {
      const { isStorefrontProjectionRenderCutoverEnabled } = await import(
        '../lib/storefrontDesignLibrary/flags.js'
      );
      if (isStorefrontProjectionRenderCutoverEnabled()) {
        const { catalogFromDraft } = await import(
          '../lib/storefrontDesignLibrary/acceptance/index.js'
        );
        const { buildLiveRenderPayload } = await import(
          '../lib/storefrontDesignLibrary/renderCutover/index.js'
        );
        const catalog = catalogFromDraft(draft);
        if (
          !catalog.meta?.designLibraryStorefrontProjection &&
          preview?.meta?.designLibraryStorefrontProjection
        ) {
          catalog.meta = { ...catalog.meta, ...preview.meta };
        }
        const legacyStore = {
          products: catalog.products,
          preview: draft.preview,
          meta: catalog.meta,
          primaryCTA: catalog.meta?.primaryCTA ?? preview?.primaryCTA,
          websiteTemplateId: draft.websiteTemplateId ?? preview?.websiteTemplateId,
          contentTemplateId: draft.contentTemplateId ?? preview?.contentTemplateId,
          theme: preview?.website?.theme,
        };
        const live = buildLiveRenderPayload({
          catalog,
          legacyStore,
          draftStoreId: draft.id,
          context: {
            phone: preview?.phone ?? draft.input?.phone,
            bookingUrl: preview?.bookingUrl,
            businessName: draft.input?.businessName ?? preview?.storeName,
            legacyStore,
          },
        });
        storefrontRender = live.clientPayload;
      }
    } catch (cutoverErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[DraftStore] storefrontRender cutover attach failed; legacy only', cutoverErr);
      }
      storefrontRender = {
        primarySource: 'legacy',
        reason: 'resolver_error',
        authoritative: false,
        bypassLegacyNormalize: false,
        rendererId: 'cardbey-legacy-storefront-v1',
        viewModel: null,
        fallbackDetail: cutoverErr instanceof Error ? cutoverErr.message : String(cutoverErr),
      };
    }

    res.json({
      ok: true,
      draftId: draft.id,
      generationRunId: draft.generationRunId ?? null,
      status: uiStatus,
      committed: draft.status === 'committed',
      committedStoreId,
      publishState: await buildDraftPublishState(prisma, draft),
      ...(draft.status === 'committed'
        ? { redirectTo: '/app/back', message: 'Draft already saved. You can keep editing the preview.' }
        : {}),
      store,
      products,
      categories,
      preview: draft.preview,
      storefrontRender,
      heroImageUrl: isVideo ? (heroImage || heroVideo || undefined) : (heroImage || heroVideo || undefined),
      heroVideoUrl: heroVideo || undefined,
      heroVideo: heroVideo || undefined,
      heroMediaType: isVideo ? 'video' : heroImage || heroVideo ? 'image' : undefined,
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

    const {
      guardPhaseFDraftStoreRunway,
      extractMissionIdFromDraftRequest,
    } = await import('../lib/broker/phaseFBypassGuards.js');
    const runwayGuard = guardPhaseFDraftStoreRunway({
      route: 'POST /:draftId/commit',
      draftId,
      missionId: extractMissionIdFromDraftRequest(req),
      action: 'commit',
    });
    if (runwayGuard.blocked) {
      return res.status(403).json({
        ok: false,
        error: runwayGuard.code,
        message: runwayGuard.message,
      });
    }

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

    if (error.code === 'STORE_SLUG_TAKEN' || error.code === 'STORE_BUSINESS_CONFLICT') {
      return res.status(409).json({
        ok: false,
        error: error.code,
        message: error.message,
      });
    }

    if (error.code === '25P02') {
      return res.status(409).json({
        ok: false,
        error: 'STORE_PUBLISH_RETRY',
        message: 'Publish was interrupted. Please try again.',
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
