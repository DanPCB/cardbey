/**
 * Assemble HydratedContext for reactPlanner from entities, episodic memory, and working state.
 * Never throws — degrades gracefully on partial failures.
 */

import { getPrismaClient } from '../prisma.js';
import { getEvents } from '../missionBlackboard.js';
import { extractEntities } from './entityExtractor.js';
import { resolveEntities } from './entityResolver.js';
import { readEpisodicEvents, foldEpisodicContext } from './episodicWriter.js';
import { shouldResolveMessageEntitiesAfterClassification } from './entityResolutionPolicy.js';

/**
 * @typedef {import('./entityResolver.js').ResolutionError} ResolutionError
 */

/**
 * @returns {import('./memoryHydrator.js').HydratedContext}
 */
export function createEmptyHydratedContext(message = '', meta = {}) {
  return {
    message: String(message ?? ''),
    entities: {},
    episodic: { recentEvents: [] },
    working: {
      previewVisible: false,
      pendingApprovals: 0,
    },
    resolution: {
      errors: [],
      confidence: 'low',
    },
    meta: {
      userId: meta.userId ?? null,
      missionId: meta.missionId ?? null,
      hydratedAt: new Date(),
    },
  };
}

/**
 * @param {unknown} raw
 */
function parseBlackboardPayload(raw) {
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
 * @param {string} missionId
 */
async function readWorkingPreviewVisible(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return false;
  try {
    const { events } = await getEvents(mid, { limit: 30 });
    for (const e of events) {
      if (e.eventType === 'blackboard_set') {
        const p = parseBlackboardPayload(e.payload);
        if (p.key === 'working:previewVisible') {
          return Boolean(p.value);
        }
      }
    }
  } catch {
    /* non-fatal */
  }
  return false;
}

/**
 * @param {string | null} userId
 * @param {string | null} missionId
 */
async function readWorkingState(userId, missionId) {
  const working = {
    previewVisible: false,
    pendingApprovals: 0,
    activeMission: undefined,
  };

  try {
    const prisma = getPrismaClient();
    const mid = String(missionId ?? '').trim();
    const uid = String(userId ?? '').trim();

    if (mid) {
      working.previewVisible = await readWorkingPreviewVisible(mid);

      const pipe = await prisma.missionPipeline.findUnique({
        where: { id: mid },
        select: { id: true, status: true, type: true, targetId: true },
      });
      if (pipe) {
        working.activeMission = {
          id: pipe.id,
          status: pipe.status,
          type: pipe.type,
          storeId: pipe.targetId ?? null,
        };
      }
    } else if (uid) {
      const pipe = await prisma.missionPipeline.findFirst({
        where: {
          createdBy: uid,
          status: {
            in: [
              'requested',
              'running',
              'executing',
              'awaiting_approval',
              'active',
              'pending',
            ],
          },
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, status: true, type: true, targetId: true },
      });
      if (pipe) {
        working.activeMission = {
          id: pipe.id,
          status: pipe.status,
          type: pipe.type,
          storeId: pipe.targetId ?? null,
        };
        working.previewVisible = await readWorkingPreviewVisible(pipe.id);
      }
    }

    if (uid) {
      const pending = await prisma.missionPipeline.count({
        where: {
          createdBy: uid,
          status: { in: ['awaiting_approval', 'needs_input'] },
        },
      });
      working.pendingApprovals = pending;
    }
  } catch (err) {
    console.error('[MemoryHydrator] working state failed:', err?.message ?? err);
  }

  return working;
}

/**
 * @param {{
 *   message: string;
 *   userId?: string | null;
 *   missionId?: string | null;
 *   activeStoreId?: string | null;
 *   sessionContext?: Record<string, unknown> | null;
 * }} input
 * @param {{ resolveMessageEntities?: boolean }} [options]
 * @returns {Promise<HydratedContext>}
 */
export async function hydrateContext(input, options = {}) {
  const message = String(input?.message ?? '').trim();
  const userId = input?.userId != null ? String(input.userId).trim() : '';
  const missionId = input?.missionId != null ? String(input.missionId).trim() : '';
  const activeStoreId = input?.activeStoreId != null ? String(input.activeStoreId).trim() : '';
  const resolveMessageEntities = options.resolveMessageEntities === true;

  const hydrated = createEmptyHydratedContext(message, { userId: userId || null, missionId: missionId || null });

  try {
    let episodic = { recentEvents: [] };
    try {
      const { events } = await readEpisodicEvents({ userId, missionId, limit: 10 });
      episodic = foldEpisodicContext(events);
    } catch (err) {
      console.error('[MemoryHydrator] episodic read failed:', err?.message ?? err);
    }
    hydrated.episodic = episodic;

    if (resolveMessageEntities) {
      const entityRefs = extractEntities(message);
      hydrated.meta.entityRefCount = entityRefs.length;

      try {
        const resolution = await resolveEntities(entityRefs, userId, episodic, {
          missionId: missionId || null,
          activeStoreId: activeStoreId || null,
        });
        hydrated.entities = resolution.resolved;
        hydrated.resolution = {
          errors: resolution.errors,
          confidence: resolution.confidence,
        };
      } catch (err) {
        console.error('[MemoryHydrator] entity resolve failed:', err?.message ?? err);
      }
    }

    if (!hydrated.entities.store && activeStoreId) {
      hydrated.entities.store = {
        id: activeStoreId,
        name: '',
        slug: null,
      };
      if (hydrated.resolution.confidence === 'low') {
        hydrated.resolution.confidence = 'medium';
      }
    }

    try {
      hydrated.working = await readWorkingState(userId, missionId);
    } catch (err) {
      console.error('[MemoryHydrator] working read failed:', err?.message ?? err);
    }

    if (input?.sessionContext && typeof input.sessionContext === 'object') {
      hydrated.meta.sessionContext = input.sessionContext;
    }
  } catch (err) {
    console.error('[MemoryHydrator] hydrate failed:', err?.message ?? err);
  }

  hydrated.meta.hydratedAt = new Date();
  return hydrated;
}

/**
 * Post-classification entity enrichment — DB lookups only when the classified tool needs them.
 *
 * @param {HydratedContext} hydrated
 * @param {{
 *   message: string;
 *   classification: { tool?: string; executionPath?: string } | null;
 *   userId?: string | null;
 *   missionId?: string | null;
 *   activeStoreId?: string | null;
 *   sessionContext?: Record<string, unknown> | null;
 * }} input
 * @returns {Promise<HydratedContext>}
 */
export async function enrichHydratedContextWithIntentEntities(hydrated, input) {
  const base = hydrated && typeof hydrated === 'object' ? hydrated : createEmptyHydratedContext();
  const classification = input?.classification ?? null;
  const sessionContext = input?.sessionContext ?? base.meta?.sessionContext ?? null;

  if (!shouldResolveMessageEntitiesAfterClassification(classification, sessionContext)) {
    return base;
  }

  const message = String(input?.message ?? base.message ?? '').trim();
  const userId = input?.userId != null ? String(input.userId).trim() : '';
  const missionId = input?.missionId != null ? String(input.missionId).trim() : '';
  const activeStoreId = input?.activeStoreId != null ? String(input.activeStoreId).trim() : '';
  const episodic = base.episodic ?? { recentEvents: [] };

  const entityRefs = extractEntities(message);
  if (!entityRefs.length) {
    return base;
  }

  try {
    const resolution = await resolveEntities(entityRefs, userId, episodic, {
      missionId: missionId || null,
      activeStoreId: activeStoreId || null,
    });
    return {
      ...base,
      meta: { ...base.meta, entityRefCount: entityRefs.length },
      entities: { ...base.entities, ...resolution.resolved },
      resolution: {
        errors: resolution.errors,
        confidence: resolution.confidence,
      },
    };
  } catch (err) {
    console.error('[MemoryHydrator] intent entity enrich failed:', err?.message ?? err);
    return base;
  }
}

/**
 * Build planner-facing context object (legacy `context` shape + hydrated fields).
 * @param {HydratedContext} hydrated
 * @param {Record<string, unknown>} [baseContext]
 */
export function hydratedContextToPlannerContext(hydrated, baseContext = {}) {
  const storeId =
    hydrated?.entities?.store?.id ??
    baseContext?.storeId ??
    hydrated?.working?.activeMission?.storeId ??
    null;

  return {
    ...baseContext,
    storeId,
    hydratedContext: hydrated,
    resolutionErrors: hydrated?.resolution?.errors ?? [],
    resolutionConfidence: hydrated?.resolution?.confidence ?? 'low',
    episodic: hydrated?.episodic ?? {},
    entities: hydrated?.entities ?? {},
  };
}
