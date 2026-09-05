/**
 * Phase 0 — Canonical Website Editing context resolver.
 *
 * Opens Draft Review for an existing store/draft without requiring generationRunId.
 * Never creates a Business. May initialise a DraftStore revision via the existing
 * create-from-store contract (idempotent). Does not publish or mutate live storefront.
 */

import { getTenantId } from '../../lib/tenant.js';
import { isPlatformAdmin } from '../../lib/authorization.js';
import { canAccessDraftStore } from '../../lib/draftOwnership.js';
import { resolveDraftForStore } from '../../lib/draftResolver.js';
import {
  createDraftStoreForUser,
  normalizePreviewCategories,
} from '../draftStore/draftStoreService.js';
import { slugify } from '../../utils/slug.js';

const EDITING_KINDS = {
  GENERATED_DRAFT: 'generated_draft',
  UNPUBLISHED_REVISION: 'unpublished_revision',
  PUBLISHED_WITH_REVISION: 'published_with_revision',
};

const DEFAULT_EXPIRY_HOURS = 48;

/** In-process lock so concurrent Website Editing opens cannot double-init DraftStore. */
const initLocks = new Map();

async function withStoreInitLock(storeId, fn) {
  const key = String(storeId);
  const prev = initLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  initLocks.set(
    key,
    chained.catch(() => {}),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (initLocks.get(key) === chained) initLocks.delete(key);
  }
}

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function parseJsonField(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

function draftLinkedStoreId(draft) {
  if (!draft) return null;
  if (draft.committedStoreId && String(draft.committedStoreId).trim()) {
    return String(draft.committedStoreId).trim();
  }
  const input = parseJsonField(draft.input);
  if (input.storeId && String(input.storeId).trim() && String(input.storeId).trim() !== 'temp') {
    return String(input.storeId).trim();
  }
  const preview = parseJsonField(draft.preview);
  const metaStoreId = preview?.meta?.storeId;
  if (metaStoreId && String(metaStoreId).trim() && String(metaStoreId).trim() !== 'temp') {
    return String(metaStoreId).trim();
  }
  return null;
}

function draftGenerationRunId(draft) {
  if (!draft) return null;
  if (draft.generationRunId && String(draft.generationRunId).trim()) {
    return String(draft.generationRunId).trim();
  }
  const input = parseJsonField(draft.input);
  if (input.generationRunId && String(input.generationRunId).trim()) {
    return String(input.generationRunId).trim();
  }
  const preview = parseJsonField(draft.preview);
  const metaRun = preview?.meta?.generationRunId;
  if (metaRun && String(metaRun).trim()) return String(metaRun).trim();
  return null;
}

function classifyEditingKind({ business, draft }) {
  if (!business) return EDITING_KINDS.GENERATED_DRAFT;
  if (business.isActive || business.publishedAt) return EDITING_KINDS.PUBLISHED_WITH_REVISION;
  return EDITING_KINDS.UNPUBLISHED_REVISION;
}

/**
 * Build preview payload from Business (same contract as POST /api/draft-store/create-from-store).
 */
async function buildPreviewFromBusiness(prisma, business) {
  const storeId = business.id;
  const products = await prisma.product.findMany({
    where: { businessId: storeId, deletedAt: null },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, description: true, price: true, category: true, imageUrl: true },
  });
  const catNames = [
    ...new Set(
      products
        .map((p) => (p.category && String(p.category).trim()) || null)
        .filter(Boolean),
    ),
  ];
  const catKey = (name) => (name && slugify(String(name).trim())) || 'other';
  const categories = catNames.length
    ? catNames.map((name) => ({ id: catKey(name), name: String(name).trim() }))
    : [];
  if (!categories.some((c) => c.id === 'other')) {
    categories.push({ id: 'other', name: 'Other' });
  }
  const items = products.map((p) => {
    const catName = p.category ?? null;
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      price: p.price != null ? p.price : null,
      category: catName,
      categoryId: catKey(catName),
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
    } catch {
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
  return preview;
}

/**
 * Idempotent editable revision for a Business (existing create-from-store contract).
 * @returns {{ draft: object, initialized: boolean }}
 */
async function ensureEditableRevisionForBusiness(prisma, { business, user, userId }) {
  const storeId = business.id;
  const resolved = await resolveDraftForStore(prisma, storeId, null);
  const existingStatus = String(resolved.draft?.status || '').toLowerCase();
  if (
    resolved.draft &&
    (existingStatus === 'ready' || existingStatus === 'draft' || existingStatus === 'generating')
  ) {
    return { draft: resolved.draft, initialized: false };
  }

  const preview = await buildPreviewFromBusiness(prisma, business);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);
  const draft = await createDraftStoreForUser(prisma, {
    user,
    userId,
    tenantKey: getTenantId(user),
    input: { storeId, source: 'website-editing-phase0' },
    expiresAt,
    mode: 'personal',
    status: 'ready',
    preview,
  });
  return { draft, initialized: true };
}

async function loadDraftById(prisma, draftId) {
  return prisma.draftStore.findUnique({ where: { id: draftId } });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   storeId?: string | null,
 *   draftId?: string | null,
 *   revisionId?: string | null,
 *   generationRunId?: string | null,
 *   userId: string,
 *   user: object,
 *   adminSupport?: boolean,
 *   allowInit?: boolean,
 * }} args
 */
export async function resolveWebsiteEditingContext(prisma, args) {
  const storeIdIn = args.storeId != null ? String(args.storeId).trim() : '';
  const draftIdIn = args.draftId != null ? String(args.draftId).trim() : '';
  const revisionIdIn = args.revisionId != null ? String(args.revisionId).trim() : '';
  const explicitDraftId = revisionIdIn || draftIdIn;
  const generationRunIdIn =
    args.generationRunId != null && String(args.generationRunId).trim()
      ? String(args.generationRunId).trim()
      : null;
  const adminSupport = Boolean(args.adminSupport);
  const allowInit = args.allowInit !== false;
  const userId = args.userId;
  const user = args.user;

  if (!userId || !user) {
    throw httpError(401, 'unauthorized', 'Authentication required');
  }

  if (adminSupport && !isPlatformAdmin(user)) {
    throw httpError(403, 'forbidden', 'Platform admin access required');
  }

  const storeIdNormalized =
    storeIdIn && storeIdIn !== '_' && storeIdIn !== 'temp' && storeIdIn !== 'draft'
      ? storeIdIn
      : '';

  if (!storeIdNormalized && !explicitDraftId && !generationRunIdIn) {
    throw httpError(400, 'context_required', 'storeId or draftId is required');
  }

  /** @type {object | null} */
  let business = null;
  if (storeIdNormalized) {
    business = await prisma.business.findUnique({
      where: { id: storeIdNormalized },
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
        isActive: true,
        publishedAt: true,
      },
    });
    if (!business) {
      throw httpError(404, 'store_not_found', 'Store not found');
    }
    if (!adminSupport && business.userId !== userId) {
      throw httpError(403, 'forbidden', 'You do not have access to this store');
    }
  }

  /** @type {object | null} */
  let draft = null;
  let initializedRevision = false;
  let resolutionStep = 'none';

  // 1) Explicit revision/draft belonging to the requested store
  if (explicitDraftId) {
    draft = await loadDraftById(prisma, explicitDraftId);
    if (!draft) {
      throw httpError(404, 'draft_not_found', 'Draft not found');
    }
    const linkedStoreId = draftLinkedStoreId(draft);
    if (storeIdNormalized && linkedStoreId && linkedStoreId !== storeIdNormalized) {
      throw httpError(403, 'cross_store_draft', 'Draft does not belong to this store');
    }
    if (!adminSupport) {
      const allowed = await canAccessDraftStore(draft, {
        userId,
        tenantKey: getTenantId(user) ?? userId,
        isSuperAdmin: false,
      });
      if (!allowed && (!business || business.userId !== userId)) {
        throw httpError(403, 'forbidden', 'You do not have access to this draft');
      }
    }
    if (!business && linkedStoreId) {
      business = await prisma.business.findUnique({
        where: { id: linkedStoreId },
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
          isActive: true,
          publishedAt: true,
        },
      });
      if (business && !adminSupport && business.userId !== userId) {
        throw httpError(403, 'forbidden', 'You do not have access to this store');
      }
    }
    resolutionStep = 'explicit_draft';
  }

  // 2–3) Existing active unpublished / canonical draft for store (not committed snapshots)
  if (!draft && storeIdNormalized) {
    const resolved = await resolveDraftForStore(prisma, storeIdNormalized, generationRunIdIn);
    const st = String(resolved.draft?.status || '').toLowerCase();
    if (resolved.draft && (st === 'ready' || st === 'draft' || st === 'generating')) {
      draft = resolved.draft;
      resolutionStep = generationRunIdIn ? 'legacy_generation_run' : 'store_draft';
    }
  }

  // Legacy: generationRunId only (no store) — translate to draft context
  if (!draft && generationRunIdIn && !storeIdNormalized) {
    const resolved = await resolveDraftForStore(prisma, 'temp', generationRunIdIn);
    if (resolved.draft) {
      draft = resolved.draft;
      resolutionStep = 'legacy_generation_run';
      if (!adminSupport) {
        const allowed = await canAccessDraftStore(draft, {
          userId,
          tenantKey: getTenantId(user) ?? userId,
          isSuperAdmin: false,
        });
        if (!allowed) {
          throw httpError(403, 'forbidden', 'You do not have access to this draft');
        }
      }
    }
  }

  // 4) Initialise editable revision of the same store (create-from-store contract)
  if (!draft && business && allowInit) {
    const ensured = await withStoreInitLock(business.id, async () => {
      // Re-check inside lock — another concurrent open may have created the draft.
      return ensureEditableRevisionForBusiness(prisma, {
        business,
        user,
        userId: adminSupport ? business.userId || userId : userId,
      });
    });
    draft = ensured.draft;
    initializedRevision = ensured.initialized;
    resolutionStep = ensured.initialized ? 'initialized_revision' : 'store_draft';
  }

  if (!draft) {
    throw httpError(
      404,
      'editable_context_not_found',
      'No editable Website Editing context found for this store',
    );
  }

  const effectiveStoreId = business?.id || draftLinkedStoreId(draft) || storeIdNormalized || 'draft';
  const editingKind = classifyEditingKind({ business, draft });
  const storeName =
    (business?.name && String(business.name).trim()) ||
    parseJsonField(draft.preview)?.storeName ||
    parseJsonField(draft.input)?.businessName ||
    'Store';
  const isPublishedStore = Boolean(business && (business.isActive || business.publishedAt));

  return {
    ok: true,
    storeId: effectiveStoreId,
    storeName,
    draftId: String(draft.id),
    revisionId: String(draft.id),
    generationRunId: draftGenerationRunId(draft),
    editingKind,
    isPublishedStore,
    adminSupport,
    initializedRevision,
    resolutionStep,
    liveUnchanged: true,
    entry: adminSupport ? 'admin' : 'owner',
  };
}

export const WEBSITE_EDITING_KINDS = EDITING_KINDS;
