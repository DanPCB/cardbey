/**
 * MissionTask: executable tasks created from planner plan_update (Next Steps).
 * One task per execution suggestion; prevents duplicates by sourceMessageId and normalizedLabel.
 */

import { getPrismaClient } from '../lib/prisma.js';

function normalizeLabel(label) {
  if (label == null || typeof label !== 'string') return '';
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Create MissionTask rows from suggestions after a plan_update. Deduplicates by normalized label
 * within the batch and against existing tasks for this (missionId, sourceMessageId).
 *
 * @param {string} missionId
 * @param {string} sourceMessageId - plan_update message id
 * @param {{ id: string, label: string, agentKey?: string, intent?: string, risk?: string }[]} suggestions
 * @param {string} chainId
 * @returns {Promise<number>} Number of tasks created (0 if all duplicates)
 */
export async function createMissionTasksFromPlanUpdate(missionId, sourceMessageId, suggestions, chainId) {
  if (!missionId || !sourceMessageId || !chainId) return 0;
  const list = Array.isArray(suggestions) ? suggestions : [];
  if (list.length === 0) return 0;

  const prisma = getPrismaClient();

  // Deduplicate within this plan_update by normalizedLabel (first occurrence wins)
  const byNormalized = new Map();
  for (const s of list) {
    const rawLabel = (s && s.label) ? String(s.label).slice(0, 500) : 'Task';
    const normalized = normalizeLabel(rawLabel) || 'task';
    if (byNormalized.has(normalized)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[createMissionTasksFromPlanUpdate] Skipping duplicate step (same plan_update):', rawLabel.slice(0, 60));
      }
      continue;
    }
    byNormalized.set(normalized, { ...s, rawLabel, normalized });
  }
  const deduped = [...byNormalized.values()];
  if (deduped.length === 0) return 0;

  // Skip entirely if we already have any task for this sourceMessageId (same plan_update)
  const existingAny = await prisma.missionTask.findFirst({
    where: { missionId, sourceMessageId },
    select: { id: true },
  });
  if (existingAny) return 0;

  const now = new Date();
  const toInsert = deduped.map((s) => ({
    missionId,
    title: s.rawLabel,
    normalizedLabel: s.normalized,
    description: null,
    status: 'pending',
    sourceMessageId,
    chainId,
    suggestionId: (s && s.id) ? String(s.id) : null,
    agentKey: (s && s.agentKey) ? String(s.agentKey) : null,
    agentKeyRecommended: (s && s.agentKey) ? String(s.agentKey) : null,
    intent: (s && s.intent) ? String(s.intent) : null,
    risk: (s && s.risk) ? String(s.risk) : null,
    createdAt: now,
    updatedAt: now,
  }));
  if (toInsert.length === 0) return 0;

  await prisma.missionTask.createMany({ data: toInsert });
  return toInsert.length;
}

/**
 * Update task status. Used by UI (Mark Complete, Skip) and by run success/failure.
 *
 * @param {string} taskId
 * @param {'pending'|'running'|'completed'|'skipped'|'review'|'waiting_approval'} status
 * @returns {Promise<object|null>}
 */
export async function updateMissionTaskStatus(taskId, status) {
  if (!taskId || !status) return null;
  const valid = ['pending', 'running', 'completed', 'skipped', 'review', 'waiting_approval'];
  if (!valid.includes(status)) return null;
  const prisma = getPrismaClient();
  return prisma.missionTask.update({
    where: { id: taskId },
    data: { status, updatedAt: new Date() },
  }).catch(() => null);
}

/**
 * Set task to running and link lastRunId. Used when dispatch creates an AgentRun for this task.
 * If lastRunId column is missing (migration not run), falls back to updating status only.
 *
 * @param {string} taskId
 * @param {string} runId
 * @returns {Promise<object|null>}
 */
export async function setMissionTaskRunning(taskId, runId) {
  if (!taskId || !runId) return null;
  const prisma = getPrismaClient();
  const now = new Date();
  const updated = await prisma.missionTask.update({
    where: { id: taskId },
    data: { status: 'running', lastRunId: runId, updatedAt: now },
  }).catch(async (err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[missionTask] setMissionTaskRunning with lastRunId failed:', err?.message || err);
    }
    return prisma.missionTask.update({
      where: { id: taskId },
      data: { status: 'running', updatedAt: now },
    }).catch(() => null);
  });
  return updated;
}

/**
 * Update task status and optional meta (e.g. lastError on failure). Used by executor on run completion/failure.
 *
 * @param {string} taskId
 * @param {'pending'|'running'|'completed'|'skipped'|'review'|'waiting_approval'} status
 * @param {{ lastError?: string, blocked?: boolean } | null} [meta]
 * @returns {Promise<object|null>}
 */
export async function updateMissionTaskStatusAndMeta(taskId, status, meta = null) {
  if (!taskId || !status) return null;
  const valid = ['pending', 'running', 'completed', 'skipped', 'review', 'waiting_approval'];
  if (!valid.includes(status)) return null;
  const prisma = getPrismaClient();
  const data = { status, updatedAt: new Date() };
  if (meta != null && typeof meta === 'object') data.meta = meta;
  return prisma.missionTask.update({
    where: { id: taskId },
    data,
  }).catch(() => null);
}

/**
 * Find task by missionId and task id. Used by dispatch and executor.
 *
 * @param {string} missionId
 * @param {string} taskId
 * @returns {Promise<object|null>}
 */
export async function findMissionTaskById(missionId, taskId) {
  if (!missionId || !taskId) return null;
  const prisma = getPrismaClient();
  return prisma.missionTask.findFirst({
    where: { id: taskId, missionId },
  }).catch(() => null);
}

/**
 * Find task by missionId and suggestionId (for run completion updates).
 *
 * @param {string} missionId
 * @param {string} suggestionId
 * @returns {Promise<object|null>}
 */
export async function findMissionTaskBySuggestion(missionId, suggestionId) {
  if (!missionId || !suggestionId) return null;
  const prisma = getPrismaClient();
  return prisma.missionTask.findFirst({
    where: { missionId, suggestionId },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);
}
