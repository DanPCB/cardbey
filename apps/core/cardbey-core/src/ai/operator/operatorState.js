/**
 * AI Operator state: MissionOperatorRun load/save and create.
 * Uses getPrismaClient (client-gen) so MissionOperatorRun model is available after prisma generate.
 */

import { getPrismaClient } from '../../lib/prisma.js';

const DEFAULT_MAX_ATTEMPTS = 20;

/**
 * @typedef {Object} OperatorState
 * @property {string} id
 * @property {string} missionId
 * @property {string} missionType
 * @property {string|null} goal
 * @property {string|null} tenantId
 * @property {string|null} userId
 * @property {string} currentStage
 * @property {string|null} currentDraftId
 * @property {string|null} currentJobId
 * @property {string|null} currentGenerationRunId
 * @property {string|null} currentStoreId
 * @property {number} attempts
 * @property {number} maxAttempts
 * @property {string} status
 * @property {object|null} lastError
 * @property {object|null} artifactSnapshot
 * @property {string|null} agentThreadId
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * Load MissionRun by id.
 * @param {string} missionRunId
 * @returns {Promise<OperatorState|null>}
 */
export async function loadOperatorState(missionRunId) {
  if (!missionRunId || typeof missionRunId !== 'string' || !missionRunId.trim()) {
    return null;
  }
  const prisma = getPrismaClient();
  if (!prisma.missionOperatorRun) return null;
  const row = await prisma.missionOperatorRun.findUnique({
    where: { id: missionRunId.trim() },
  }).catch(() => null);
  return row ? rowToState(row) : null;
}

/**
 * Load latest MissionOperatorRun by missionId (dashboard mission id).
 * @param {string} missionId
 * @returns {Promise<OperatorState|null>}
 */
export async function loadOperatorStateByMissionId(missionId) {
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
    return null;
  }
  const prisma = getPrismaClient();
  if (!prisma.missionOperatorRun) return null;
  const row = await prisma.missionOperatorRun.findFirst({
    where: { missionId: missionId.trim() },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);
  return row ? rowToState(row) : null;
}

/**
 * Update MissionOperatorRun by id. Patch only provided fields.
 * @param {string} missionRunId
 * @param {Partial<OperatorState>} patch
 * @returns {Promise<OperatorState|null>}
 */
export async function saveOperatorState(missionRunId, patch) {
  if (!missionRunId || typeof missionRunId !== 'string' || !missionRunId.trim()) {
    return null;
  }
  const prisma = getPrismaClient();
  if (!prisma.missionOperatorRun) return null;
  const data = {};
  const allowed = [
    'currentStage', 'currentDraftId', 'currentJobId', 'currentGenerationRunId', 'currentStoreId',
    'attempts', 'maxAttempts', 'status', 'lastError', 'artifactSnapshot', 'agentThreadId', 'goal',
    'runPipelineAsSingleStep',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }
  if (Object.keys(data).length === 0) return loadOperatorState(missionRunId);
  const row = await prisma.missionOperatorRun.update({
    where: { id: missionRunId.trim() },
    data: { ...data, updatedAt: new Date() },
  }).catch(() => null);
  return row ? rowToState(row) : null;
}

/**
 * Create a new MissionOperatorRun (operator run for Agent Chat / build_store flow).
 * @param {Object} params
 * @param {string} params.missionId
 * @param {string} params.missionType
 * @param {string} [params.goal]
 * @param {string} [params.tenantId]
 * @param {string} [params.userId]
 * @param {number} [params.maxAttempts]
 * @param {string} [params.agentThreadId]
 * @param {boolean} [params.runPipelineAsSingleStep]
 * @returns {Promise<OperatorState|null>}
 */
export async function createMissionRun(params) {
  const { missionId, missionType, goal, tenantId, userId, maxAttempts, agentThreadId, runPipelineAsSingleStep } = params || {};
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
    return null;
  }
  if (!missionType || typeof missionType !== 'string' || !missionType.trim()) {
    return null;
  }
  const prisma = getPrismaClient();
  if (!prisma.missionOperatorRun) return null;
  const data = {
    missionId: missionId.trim(),
    missionType: (missionType || 'build_store').trim(),
    goal: goal != null && typeof goal === 'string' ? goal.trim() || null : null,
    tenantId: tenantId != null && typeof tenantId === 'string' ? tenantId.trim() || null : null,
    userId: userId != null && typeof userId === 'string' ? userId.trim() || null : null,
    currentStage: 'planning',
    attempts: 0,
    maxAttempts: typeof maxAttempts === 'number' && maxAttempts > 0 ? maxAttempts : DEFAULT_MAX_ATTEMPTS,
    status: 'running',
    agentThreadId: agentThreadId != null && typeof agentThreadId === 'string' ? agentThreadId.trim() || null : null,
  };
  if (runPipelineAsSingleStep !== undefined) {
    data.runPipelineAsSingleStep = Boolean(runPipelineAsSingleStep);
  }
  const row = await prisma.missionOperatorRun.create({ data }).catch(() => null);
  return row ? rowToState(row) : null;
}

function rowToState(row) {
  return {
    id: row.id,
    missionId: row.missionId,
    missionType: row.missionType,
    goal: row.goal ?? null,
    tenantId: row.tenantId ?? null,
    userId: row.userId ?? null,
    currentStage: row.currentStage ?? 'planning',
    currentDraftId: row.currentDraftId ?? null,
    currentJobId: row.currentJobId ?? null,
    currentGenerationRunId: row.currentGenerationRunId ?? null,
    currentStoreId: row.currentStoreId ?? null,
    attempts: row.attempts ?? 0,
    maxAttempts: row.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    status: row.status ?? 'running',
    lastError: row.lastError ?? null,
    artifactSnapshot: row.artifactSnapshot ?? null,
    agentThreadId: row.agentThreadId ?? null,
    runPipelineAsSingleStep: row.runPipelineAsSingleStep ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
