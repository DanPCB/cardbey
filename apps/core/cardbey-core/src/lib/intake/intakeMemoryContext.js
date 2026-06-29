/**
 * Intake v2 — client memory payload normalization (memorySummary + unifiedMemory).
 */

import { resolveIntakeAssetSessionKey } from './intakeWorkflowContext.js';

function pickString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * @param {unknown} ctx
 * @returns {Record<string, unknown>}
 */
export function pickMemorySummary(ctx) {
  const c = ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {};
  const mem = /** @type {Record<string, unknown>} */ (c).memorySummary;
  if (!mem || typeof mem !== 'object' || Array.isArray(mem)) return {};
  return /** @type {Record<string, unknown>} */ (mem);
}

/**
 * @param {unknown} ctx
 * @returns {Record<string, unknown> | null}
 */
export function pickUnifiedMemory(ctx) {
  const c = ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {};
  const raw = /** @type {Record<string, unknown>} */ (c).unifiedMemory;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return /** @type {Record<string, unknown>} */ (raw);
}

/**
 * Slim unified-memory snapshot for intake (dashboard → POST currentContext.unifiedMemory).
 *
 * @param {unknown} raw
 * @returns {Record<string, unknown> | null}
 */
export function normalizeUnifiedMemorySnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = /** @type {Record<string, unknown>} */ (raw);
  const keyFacts = Array.isArray(input.keyFacts)
    ? input.keyFacts.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const learnedSignals = Array.isArray(input.learnedSignals)
    ? input.learnedSignals.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 8)
    : [];

  const snapshot = {
    ...(pickString(input.activeSummary) ? { activeSummary: pickString(input.activeSummary) } : {}),
    ...(keyFacts.length ? { keyFacts } : {}),
    ...(learnedSignals.length ? { learnedSignals } : {}),
    ...(pickString(input.missionType) ? { missionType: pickString(input.missionType) } : {}),
    ...(pickString(input.missionActiveSummary)
      ? { missionActiveSummary: pickString(input.missionActiveSummary) }
      : {}),
    ...(typeof input.productCount === 'number' && Number.isFinite(input.productCount)
      ? { productCount: input.productCount }
      : {}),
    ...(typeof input.hasActivePromotion === 'boolean'
      ? { hasActivePromotion: input.hasActivePromotion }
      : {}),
    ...(typeof input.partial === 'boolean' ? { partial: input.partial } : {}),
  };

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/**
 * @param {unknown} ctx
 * @returns {string | null}
 */
export function resolveIntakeStoreId(ctx) {
  const c = ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {};
  const mem = pickMemorySummary(c);
  const memoryContext =
    c._memoryContext && typeof c._memoryContext === 'object' && !Array.isArray(c._memoryContext)
      ? c._memoryContext
      : null;
  const storeFromMemoryContext =
    memoryContext?.hasActiveStore && memoryContext?.store?.id
      ? String(memoryContext.store.id).trim()
      : null;
  return pickString(
    /** @type {Record<string, unknown>} */ (c).activeStoreId,
    /** @type {Record<string, unknown>} */ (c).storeId,
    mem.storeId,
    storeFromMemoryContext,
  );
}

/**
 * @param {unknown} ctx
 * @returns {string | null}
 */
export function resolveIntakeDraftId(ctx) {
  const c = ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {};
  const mem = pickMemorySummary(c);
  return pickString(
    /** @type {Record<string, unknown>} */ (c).activeDraftId,
    /** @type {Record<string, unknown>} */ (c).draftId,
    mem.draftStoreId,
    mem.draftId,
  );
}

/**
 * @param {{ body?: Record<string, unknown>; currentContext?: Record<string, unknown> }} [input]
 * @returns {string | null}
 */
export function resolveIntakeMissionId(input = {}) {
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const ctx = input.currentContext && typeof input.currentContext === 'object' ? input.currentContext : {};
  const mem = pickMemorySummary(ctx);
  return pickString(body.missionId, ctx.activeMissionId, mem.missionId);
}

/**
 * Attach normalized memory fields for downstream classify / hydrate consumers.
 *
 * @param {Record<string, unknown>} currentContext
 * @returns {Record<string, unknown>}
 */
export function attachIntakeMemoryFields(currentContext = {}) {
  const base = currentContext && typeof currentContext === 'object' ? { ...currentContext } : {};
  const memorySummary = pickMemorySummary(base);
  const unifiedMemory = normalizeUnifiedMemorySnapshot(pickUnifiedMemory(base));

  if (Object.keys(memorySummary).length > 0) {
    base.memorySummary = memorySummary;
  }
  if (unifiedMemory) {
    base.unifiedMemory = unifiedMemory;
  }

  const storeFromMemory = pickString(memorySummary.storeId);
  const draftFromMemory = pickString(memorySummary.draftStoreId, memorySummary.draftId);
  const missionFromMemory = pickString(memorySummary.missionId);

  if (!pickString(base.activeStoreId, base.storeId) && storeFromMemory) {
    base.activeStoreId = storeFromMemory;
    base.storeId = storeFromMemory;
  }
  if (!pickString(base.activeDraftId, base.draftId) && draftFromMemory) {
    base.activeDraftId = draftFromMemory;
    base.draftId = draftFromMemory;
  }
  if (!pickString(base.activeMissionId) && missionFromMemory) {
    base.activeMissionId = missionFromMemory;
  }

  return base;
}

/**
 * Merge memory bundle store context into intake currentContext (session hydration).
 *
 * @param {Record<string, unknown>} currentContext
 * @param {unknown} bundle
 * @returns {Record<string, unknown>}
 */
export function hydrateContextFromMemoryBundle(currentContext = {}, bundle = null) {
  const base = attachIntakeMemoryFields(currentContext);
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return base;

  const bundleContext =
    /** @type {Record<string, unknown>} */ (bundle)._context &&
    typeof /** @type {Record<string, unknown>} */ (bundle)._context === 'object'
      ? /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (bundle)._context)
      : null;

  if (bundleContext) {
    base._memoryContext = bundleContext;
    const store =
      bundleContext.store && typeof bundleContext.store === 'object' ? bundleContext.store : null;
    const storeId = store?.id ? String(store.id).trim() : null;
    if (bundleContext.hasActiveStore === true && storeId && !pickString(base.activeStoreId, base.storeId)) {
      base.activeStoreId = storeId;
      base.storeId = storeId;
    }
    if (store?.name && !pickString(base.activeStoreName)) {
      base.activeStoreName = String(store.name);
    }
    if (store?.category && !pickString(base.activeStoreCategory)) {
      base.activeStoreCategory = String(store.category);
    }
  }

  return base;
}

/**
 * Extract store id from intakeV2Selection replay payload.
 *
 * @param {unknown} selection
 * @returns {string | null}
 */
export function resolveStoreIdFromIntakeSelection(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
  const params =
    /** @type {Record<string, unknown>} */ (selection).selectedParameters &&
    typeof /** @type {Record<string, unknown>} */ (selection).selectedParameters === 'object'
      ? /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (selection).selectedParameters)
      : {};
  return pickString(params.storeId, params.activeStoreId);
}

/**
 * Structured fallback when memory facade load fails or actor is unknown.
 *
 * @param {{ startTime?: number; error?: string; reason?: string }} [opts]
 */
export function createMemoryBundleFallback(opts = {}) {
  const startTime = typeof opts.startTime === 'number' ? opts.startTime : Date.now();
  const sessionStoreId = opts.sessionStoreId ? String(opts.sessionStoreId).trim() : null;
  return {
    ok: false,
    _context: {
      hasActiveStore: Boolean(sessionStoreId),
      store: sessionStoreId
        ? { id: sessionStoreId, name: null, category: null, status: 'active' }
        : null,
    },
    business: null,
    suitcase: [],
    user: null,
    session: null,
    mission: null,
    activeSummary: null,
    keyFacts: [],
    _metadata: {
      loadTimeMs: Date.now() - startTime,
      loaded: false,
      partial: true,
      error: opts.error ?? opts.reason ?? 'memory_unavailable',
      fallback: true,
    },
  };
}

/**
 * @param {unknown} bundle
 * @returns {{
 *   loaded: boolean;
 *   partial: boolean;
 *   loadTimeMs?: number | null;
 *   error?: string | null;
 *   warning?: string | null;
 *   sources?: string[];
 * }}
 */
export function extractMemoryLoadStatus(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return {
      loaded: false,
      partial: true,
      error: 'no_bundle',
      warning: 'Memory bundle was not loaded. Mission context may be limited.',
    };
  }

  const meta =
    bundle._metadata && typeof bundle._metadata === 'object' && !Array.isArray(bundle._metadata)
      ? bundle._metadata
      : {};
  const facadeMeta =
    bundle.meta && typeof bundle.meta === 'object' && !Array.isArray(bundle.meta) ? bundle.meta : {};

  if (meta.loaded === false || meta.fallback === true) {
    return {
      loaded: false,
      partial: true,
      loadTimeMs: typeof meta.loadTimeMs === 'number' ? meta.loadTimeMs : null,
      error: typeof meta.error === 'string' ? meta.error : 'load_failed',
      warning: 'Some memory data was unavailable. Mission context may be limited.',
    };
  }

  return {
    loaded: true,
    partial: meta.partial === true || facadeMeta.partial === true,
    loadTimeMs:
      typeof meta.loadTimeMs === 'number'
        ? meta.loadTimeMs
        : typeof facadeMeta.fetchDurationMs === 'number'
          ? facadeMeta.fetchDurationMs
          : null,
    sources: Array.isArray(facadeMeta.sources) ? facadeMeta.sources : [],
  };
}

/**
 * Load unified memory bundle for intake reasoning (non-blocking; returns structured fallback on failure).
 * @param {{ req: import('express').Request; body: Record<string, unknown>; sessionId?: string | null }} input
 */
export async function loadIntakeMemoryBundle(input = {}) {
  const startTime = Date.now();
  const req = input.req;
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const userId = String(req?.user?.id ?? req?.userId ?? body.userId ?? '').trim();
  if (!userId) {
    return createMemoryBundleFallback({ startTime, reason: 'user_id_required' });
  }

  const sessionId =
    String(input.sessionId ?? '').trim() ||
    String(body.sessionId ?? body.conversationSessionId ?? '').trim() ||
    resolveIntakeAssetSessionKey({
      conversationSessionId: body.conversationSessionId,
      sessionId: body.sessionId,
      userId,
      guestSessionId: req?.guestSessionId ?? null,
    });

  const ctx = body.currentContext && typeof body.currentContext === 'object' ? body.currentContext : {};
  const resolvedStoreId = resolveIntakeStoreId(ctx);

  try {
    const memoryFacade = (await import('../../services/memory/memoryFacade.js')).default;
    const workflowContext =
      ctx.workflowContext && typeof ctx.workflowContext === 'object' ? ctx.workflowContext : null;

    const result = await memoryFacade.getBundle({
      actor: {
        type: resolvedStoreId ? 'store_owner' : req?.user ? 'user' : 'guest',
        id: userId,
      },
      storeId: resolvedStoreId,
      sessionId,
      missionId: resolveIntakeMissionId({ body, currentContext: ctx }),
      sessionHints: {
        ...(workflowContext ? { workflowContext } : {}),
        ...(Array.isArray(workflowContext?.pendingIntents) ? { pendingIntents: workflowContext.pendingIntents } : {}),
        ...(workflowContext?.entities && typeof workflowContext.entities === 'object'
          ? { extractedEntities: workflowContext.entities }
          : {}),
      },
    });

    if (result && typeof result === 'object') {
      result._metadata = {
        loadTimeMs: Date.now() - startTime,
        loaded: true,
        partial: result.meta?.partial === true,
      };
    }
    return result;
  } catch (err) {
    console.warn('[intake] loadIntakeMemoryBundle failed (non-blocking):', err?.message ?? err);
    return createMemoryBundleFallback({
      startTime,
      error: err?.message || 'unknown',
      sessionStoreId: resolvedStoreId,
    });
  }
}
