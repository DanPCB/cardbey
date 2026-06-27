/**
 * Intake v2 — client memory payload normalization (memorySummary + unifiedMemory).
 */

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
  return pickString(
    /** @type {Record<string, unknown>} */ (c).activeStoreId,
    /** @type {Record<string, unknown>} */ (c).storeId,
    mem.storeId,
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
