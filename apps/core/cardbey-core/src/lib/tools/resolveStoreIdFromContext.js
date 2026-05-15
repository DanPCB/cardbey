/**
 * Resolve store / draft identifiers for post-build suggestion chips (Wire 3).
 * Prefer explicit context; when missionId is set, resolve from MissionPipeline / blackboard before stale storeContext.
 */

import { getPrismaClient } from '../prisma.js';

/** @param {unknown} raw */
function normalizePayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p != null && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {Record<string, unknown>} p
 * @returns {string | null}
 */
function storeIdFromPayloadObject(p) {
  if (!p || typeof p !== 'object') return null;
  const direct =
    (typeof p.storeId === 'string' && p.storeId.trim()) ||
    (typeof p.businessId === 'string' && p.businessId.trim()) ||
    null;
  if (direct) return direct;
  const oj = p.outputsJson;
  if (oj && typeof oj === 'object' && !Array.isArray(oj)) {
    const o = /** @type {Record<string, unknown>} */ (oj);
    if (typeof o.storeId === 'string' && o.storeId.trim()) return o.storeId.trim();
    const ssb = o.structured_store_build;
    if (ssb && typeof ssb === 'object' && !Array.isArray(ssb)) {
      const s = /** @type {Record<string, unknown>} */ (ssb);
      if (typeof s.storeId === 'string' && s.storeId.trim()) return s.storeId.trim();
      if (typeof s.businessId === 'string' && s.businessId.trim()) return s.businessId.trim();
    }
  }
  const ssbTop = p.structured_store_build;
  if (ssbTop && typeof ssbTop === 'object' && !Array.isArray(ssbTop)) {
    const s = /** @type {Record<string, unknown>} */ (ssbTop);
    if (typeof s.storeId === 'string' && s.storeId.trim()) return s.storeId.trim();
  }
  return null;
}

/**
 * @param {unknown} prisma
 * @param {string} mid
 * @returns {Promise<string | null>}
 */
async function storeIdFromMissionPipeline(prisma, mid) {
  if (!prisma?.missionPipeline?.findUnique) return null;
  try {
    const pipeline = await prisma.missionPipeline.findUnique({
      where: { id: mid },
      select: { outputsJson: true, targetId: true, targetType: true },
    });
    if (!pipeline) return null;
    const tt = String(pipeline.targetType ?? '').toLowerCase();
    const tid = typeof pipeline.targetId === 'string' ? pipeline.targetId.trim() : '';
    if ((tt === 'store' || tt === 'draft_store') && tid) return tid;
    const o =
      pipeline.outputsJson && typeof pipeline.outputsJson === 'object' && !Array.isArray(pipeline.outputsJson)
        ? /** @type {Record<string, unknown>} */ (pipeline.outputsJson)
        : {};
    const fromAgg = storeIdFromPayloadObject(o);
    if (fromAgg) return fromAgg;
    const ssb = o.structured_store_build;
    if (ssb && typeof ssb === 'object' && !Array.isArray(ssb)) {
      const s = /** @type {Record<string, unknown>} */ (ssb);
      if (typeof s.storeId === 'string' && s.storeId.trim()) return s.storeId.trim();
    }
  } catch {
    /* non-fatal */
  }
  return null;
}

/**
 * @param {{ blackboardContext?: Record<string, unknown> | null, storeContext?: Record<string, unknown> | null, missionId?: string | null }} args
 * @returns {Promise<string | null>}
 */
export async function resolveStoreIdFromContext({ blackboardContext, storeContext, missionId }) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[resolveStoreId]', {
      blackboardContextStoreId: blackboardContext?.storeId ?? blackboardContext?.activeStoreId,
      storeContextStoreId: storeContext?.storeId,
      missionId,
    });
  }

  const fromBb =
    (blackboardContext &&
      typeof blackboardContext.storeId === 'string' &&
      blackboardContext.storeId.trim()) ||
    (blackboardContext &&
      typeof blackboardContext.activeStoreId === 'string' &&
      blackboardContext.activeStoreId.trim()) ||
    null;
  if (fromBb) return fromBb;

  const fromSc =
    storeContext && typeof storeContext.storeId === 'string' && storeContext.storeId.trim()
      ? storeContext.storeId.trim()
      : null;

  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const prisma = getPrismaClient();

  if (mid) {
    const fromPipeline = await storeIdFromMissionPipeline(prisma, mid);
    if (fromPipeline) return fromPipeline;
  }

  if (mid && prisma?.missionBlackboard?.findMany) {
    try {
      const rows = await prisma.missionBlackboard.findMany({
        where: { missionId: mid },
        orderBy: { seq: 'desc' },
        take: 40,
        select: { payload: true },
      });
      for (const row of rows) {
        const p = normalizePayload(row.payload);
        const sid = storeIdFromPayloadObject(p);
        if (sid) return sid;
      }
    } catch {
      /* non-fatal */
    }
  }

  if (fromSc) return fromSc;

  return null;
}

/**
 * @param {{ blackboardContext?: Record<string, unknown> | null, storeContext?: Record<string, unknown> | null, missionId?: string | null }} args
 * @returns {Promise<{ storeId: string | null, generationRunId: string | null, draftId: string | null }>}
 */
export async function resolvePostBuildUiContext(args) {
  const storeId = await resolveStoreIdFromContext(args);
  const mid = typeof args.missionId === 'string' ? args.missionId.trim() : '';
  let generationRunId = null;
  let draftId = null;
  if (mid) {
    try {
      const prisma = getPrismaClient();
      const pipeline = await prisma.missionPipeline.findUnique({
        where: { id: mid },
        select: { outputsJson: true },
      });
      const o =
        pipeline?.outputsJson && typeof pipeline.outputsJson === 'object' && !Array.isArray(pipeline.outputsJson)
          ? /** @type {Record<string, unknown>} */ (pipeline.outputsJson)
          : {};
      const ssb =
        o.structured_store_build && typeof o.structured_store_build === 'object' && !Array.isArray(o.structured_store_build)
          ? /** @type {Record<string, unknown>} */ (o.structured_store_build)
          : {};
      if (typeof o.generationRunId === 'string' && o.generationRunId.trim()) {
        generationRunId = o.generationRunId.trim();
      } else if (typeof ssb.generationRunId === 'string' && ssb.generationRunId.trim()) {
        generationRunId = ssb.generationRunId.trim();
      }
      if (typeof o.draftId === 'string' && o.draftId.trim()) {
        draftId = o.draftId.trim();
      } else if (typeof ssb.draftId === 'string' && ssb.draftId.trim()) {
        draftId = ssb.draftId.trim();
      }
    } catch {
      /* non-fatal */
    }
  }
  return { storeId, generationRunId, draftId };
}
