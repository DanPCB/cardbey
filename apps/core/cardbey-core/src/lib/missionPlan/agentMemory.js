import { appendEvent, ensureMissionRowForBlackboard } from '../missionBlackboard.js';

/**
 * Foundation 2 — Agent context bus (shared working memory).
 * Mission.context.agentMemory holds entities and notes; agents read/write via emitContextUpdate.
 *
 * @typedef {object} AgentMemory
 * @property {{ products?: object[], offers?: object[], copy?: object[], signals?: object }} [entities]
 * @property {string} [researchNotes]
 * @property {string[]} [plannerDirectives]
 * @property {string} [lastUpdatedBy]
 * @property {string} [lastUpdatedAt]
 */

/**
 * Merge patch into current AgentMemory. Last-write-wins per key; arrays merge by id where items have id.
 *
 * @param {object} current - Current agentMemory (or {})
 * @param {object} patch - Patch to merge (partial agentMemory)
 * @returns {object} New agentMemory object (do not mutate current)
 */
export function mergeAgentMemory(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return current ? { ...current } : {};
  const out = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}) };
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) continue;
    if (key === 'entities' && patch.entities && typeof patch.entities === 'object' && !Array.isArray(patch.entities)) {
      out.entities = mergeEntities(out.entities || {}, patch.entities);
    } else if (key === 'plannerDirectives' && Array.isArray(patch.plannerDirectives)) {
      // Planner directives are an ordered "current plan" instruction list; patch replaces.
      out.plannerDirectives = [...patch.plannerDirectives];
    } else {
      out[key] = patch[key];
    }
  }
  return out;
}

/**
 * Merge entities sub-object: per-key arrays merged by id (last-write-wins per id).
 *
 * @param {object} current - Current entities
 * @param {object} patch - Patch entities
 * @returns {object}
 */
function mergeEntities(current, patch) {
  const out = { ...current };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    // Special-case: entities.signals is a shallow object merge (not an array).
    if (key === 'signals' && pv && typeof pv === 'object' && !Array.isArray(pv)) {
      const cur = out.signals && typeof out.signals === 'object' && !Array.isArray(out.signals) ? out.signals : {};
      out.signals = { ...cur, ...pv };
      continue;
    }
    if (!(pv && Array.isArray(pv))) {
      if (pv !== undefined) out[key] = pv;
      continue;
    }
    const existing = Array.isArray(out[key]) ? out[key] : [];
    const byId = new Map(existing.map((item) => [item?.id ?? item?.productId ?? Symbol(), item]));
    for (const item of pv) {
      const id = item?.id ?? item?.productId ?? Symbol();
      byId.set(id, item);
    }
    out[key] = Array.from(byId.values());
  }
  return out;
}

/**
 * Create an emitContextUpdate function for a mission and agent. Merges patch into Mission.context.agentMemory,
 * persists via mergeMissionContext, and emits MissionEvent type 'context_update'.
 * Safe to call when missionId or prisma missing (no-op). Callers must pass default no-op when not using (see §0.4).
 *
 * @param {string} [missionId]
 * @param {string} [agent] - e.g. 'catalog', 'orchestra', 'copy'
 * @param {{ prisma?: object, mergeMissionContext?: (id: string, patch: object, opts?: object) => Promise<object|null> }} [options] - prisma and optional mergeMissionContext (same client as route)
 * @returns {(patch: object) => Promise<void>}
 */
export function createEmitContextUpdate(missionId, agent, options = {}) {
  return async function emitContextUpdate(patch) {
    if (!missionId || !agent || !patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    const prisma = options.prisma;
    const mergeMissionContext = options.mergeMissionContext;
    if (!prisma || !mergeMissionContext) return;

    const loadMissionRow = async () => {
      let row = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } }).catch(() => null);
      if (!row) {
        await ensureMissionRowForBlackboard(prisma, missionId);
        row = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } }).catch(() => null);
      }
      return row;
    };

    /** ReAct / Performer: one-line reasoning feed — persists to context.reasoning_log + MissionEvent (poll / near-realtime UI). */
    const patchKeys = Object.keys(patch);
    const isReasoningLinePush =
      patchKeys.length === 1 &&
      patchKeys[0] === 'reasoning_line' &&
      patch.reasoning_line &&
      typeof patch.reasoning_line === 'object' &&
      typeof patch.reasoning_line.line === 'string';

    if (isReasoningLinePush) {
      const line = String(patch.reasoning_line.line).trimEnd();
      if (!line) return;
      const ts =
        typeof patch.reasoning_line.timestamp === 'number' && Number.isFinite(patch.reasoning_line.timestamp)
          ? patch.reasoning_line.timestamp
          : Date.now();
      const mission = await loadMissionRow();
      if (!mission) return;
      const ctx = mission.context && typeof mission.context === 'object' ? mission.context : {};
      const prev = Array.isArray(ctx.reasoning_log) ? [...ctx.reasoning_log] : [];
      await mergeMissionContext(missionId, { reasoning_log: [...prev.map(String), line] }, { prisma }).catch(() => {});
      await prisma.missionEvent.create({
        data: {
          missionId,
          agent,
          type: 'context_update',
          payload: {
            agent,
            keys: ['reasoning_line'],
            reasoning_line: { line, timestamp: ts },
            lastUpdatedAt: new Date().toISOString(),
          },
        },
      }).catch(() => {});
      // Performer BlackboardFeed polls GET /api/missions/:id/blackboard (MissionBlackboard rows).
      // Store/orchestra paths only wrote reasoning_log + MissionEvent — mirror lines here so the left panel is not empty.
      await appendEvent(
        missionId,
        'reasoning_line',
        { line, timestamp: ts, agent },
        { agentId: agent },
      ).catch(() => {});
      return;
    }

    const mission = await loadMissionRow();
    if (!mission) return;
    const current = (mission.context && mission.context.agentMemory && typeof mission.context.agentMemory === 'object')
      ? mission.context.agentMemory
      : {};
    const merged = mergeAgentMemory(current, patch);
    await mergeMissionContext(missionId, { agentMemory: merged }, { prisma }).catch(() => {});
    await prisma.missionEvent.create({
      data: {
        missionId,
        agent,
        type: 'context_update',
        payload: { agent, keys: Object.keys(patch), lastUpdatedAt: new Date().toISOString() },
      },
    }).catch(() => {});
  };
}
