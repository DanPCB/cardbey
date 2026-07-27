/**
 * Performer runtime — persistent execution records in Mission.context.
 */
import { getPrismaClient } from '../../prisma.js';
import { mergeMissionContext } from '../../mission.js';
import { isPerformerExecutionRecordsPersistEnabled } from './runtimeFlags.js';
import { resolveSkillContractForActionType } from './skillContracts.js';

export const EXECUTION_RECORDS_CONTEXT_KEY = 'performerExecutionRecords';
export const MAX_MISSION_EXECUTION_RECORDS = 48;

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeExecutionRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const executionId = typeof r.executionId === 'string' ? r.executionId.trim() : '';
  const missionId = typeof r.missionId === 'string' ? r.missionId.trim() : '';
  const actionType = typeof r.actionType === 'string' ? r.actionType.trim() : '';
  const status = typeof r.status === 'string' ? r.status.trim() : '';
  if (!executionId || !missionId || !actionType || !status) return null;
  const createdAt =
    typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
      ? r.createdAt
      : Date.now();
  const updatedAt =
    typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : createdAt;
  return {
    executionId,
    missionId,
    actionType,
    status,
    capabilityId: typeof r.capabilityId === 'string' ? r.capabilityId.trim() || undefined : undefined,
    skillId: typeof r.skillId === 'string' ? r.skillId.trim() || undefined : undefined,
    skillContractVersion:
      typeof r.skillContractVersion === 'number' ? r.skillContractVersion : undefined,
    intentId: typeof r.intentId === 'string' ? r.intentId.trim() || undefined : undefined,
    planId: typeof r.planId === 'string' ? r.planId.trim() || undefined : undefined,
    source: typeof r.source === 'string' ? r.source.trim() || undefined : undefined,
    progress: typeof r.progress === 'number' ? r.progress : undefined,
    artifacts: Array.isArray(r.artifacts)
      ? r.artifacts.map((a) => String(a)).filter(Boolean)
      : undefined,
    error: typeof r.error === 'string' ? r.error : undefined,
    previousExecutionId:
      typeof r.previousExecutionId === 'string' ? r.previousExecutionId.trim() || undefined : undefined,
    retryAttempt: typeof r.retryAttempt === 'number' ? r.retryAttempt : undefined,
    storeId: typeof r.storeId === 'string' ? r.storeId.trim() || undefined : undefined,
    draftId: typeof r.draftId === 'string' ? r.draftId.trim() || undefined : undefined,
    generationRunId:
      typeof r.generationRunId === 'string' ? r.generationRunId.trim() || undefined : undefined,
    offerDraft:
      r.offerDraft && typeof r.offerDraft === 'object' && !Array.isArray(r.offerDraft)
        ? r.offerDraft
        : undefined,
    createdAt,
    updatedAt,
  };
}

/**
 * @param {unknown} context
 * @returns {object[]}
 */
export function parseExecutionRecordsFromMissionContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return [];
  const bundle = /** @type {Record<string, unknown>} */ (context)[EXECUTION_RECORDS_CONTEXT_KEY];
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return [];
  const records = /** @type {Record<string, unknown>} */ (bundle).records;
  if (!Array.isArray(records)) return [];
  return records.map(normalizeExecutionRecord).filter(Boolean);
}

/**
 * @param {object[]} records
 * @param {object} record
 * @returns {object[]}
 */
export function upsertExecutionRecordInList(records, record) {
  const normalized = normalizeExecutionRecord(record);
  if (!normalized) return Array.isArray(records) ? [...records] : [];
  const list = Array.isArray(records) ? records.map(normalizeExecutionRecord).filter(Boolean) : [];
  const idx = list.findIndex((r) => r.executionId === normalized.executionId);
  if (idx >= 0) {
    const prev = list[idx];
    const prevTerminal = TERMINAL_STATUSES.has(prev.status);
    const nextTerminal = TERMINAL_STATUSES.has(normalized.status);
    if (prevTerminal && !nextTerminal) {
      return list;
    }
    const next = [...list];
    next[idx] = {
      ...prev,
      ...normalized,
      createdAt: prev.createdAt ?? normalized.createdAt,
      updatedAt: Math.max(prev.updatedAt ?? 0, normalized.updatedAt ?? 0),
    };
    return next.slice(-MAX_MISSION_EXECUTION_RECORDS);
  }
  return [...list, normalized].slice(-MAX_MISSION_EXECUTION_RECORDS);
}

/**
 * @param {string} missionId
 * @param {object} record
 * @param {{ prisma?: object }} [options]
 */
export async function persistMissionExecutionRecord(missionId, record, options = {}) {
  if (!isPerformerExecutionRecordsPersistEnabled()) return null;
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const normalized = normalizeExecutionRecord({ ...record, missionId: record?.missionId ?? mid });
  if (!mid || !normalized) return null;

  const prisma = options.prisma ?? getPrismaClient();
  if (!prisma?.mission) return null;

  const mission = await prisma.mission.findUnique({
    where: { id: mid },
    select: { context: true },
  });
  if (!mission) return null;

  const existing = parseExecutionRecordsFromMissionContext(mission.context);
  const records = upsertExecutionRecordInList(existing, normalized);
  const bundle = {
    version: 1,
    records,
    updatedAt: new Date().toISOString(),
  };

  await mergeMissionContext(
    mid,
    { [EXECUTION_RECORDS_CONTEXT_KEY]: bundle },
    { prisma },
  );
  return bundle;
}

/**
 * @param {string} missionId
 * @param {{ prisma?: object }} [options]
 */
export async function listMissionExecutionRecords(missionId, options = {}) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return [];
  const prisma = options.prisma ?? getPrismaClient();
  if (!prisma?.mission) return [];
  const mission = await prisma.mission.findUnique({
    where: { id: mid },
    select: { context: true },
  });
  if (!mission) return [];
  return parseExecutionRecordsFromMissionContext(mission.context);
}

/**
 * Build a record envelope from dry-run / runtime telemetry.
 *
 * @param {{
 *   missionId: string;
 *   executionId: string;
 *   actionType: string;
 *   status: string;
 *   intentId?: string;
 *   planId?: string;
 *   capabilityId?: string;
 *   source?: string;
 *   error?: string;
 * }} input
 */
export function buildExecutionRecordFromRuntime(input) {
  const missionId = String(input.missionId ?? '').trim();
  const actionType = String(input.actionType ?? '').trim();
  const contract = resolveSkillContractForActionType(actionType);
  const now = Date.now();
  return normalizeExecutionRecord({
    executionId: input.executionId,
    missionId,
    actionType,
    status: input.status,
    intentId: input.intentId,
    planId: input.planId,
    capabilityId: input.capabilityId,
    skillId: contract?.skillId,
    skillContractVersion: contract ? 1 : undefined,
    source: input.source ?? 'performer_runtime',
    error: input.error,
    createdAt: now,
    updatedAt: now,
  });
}
