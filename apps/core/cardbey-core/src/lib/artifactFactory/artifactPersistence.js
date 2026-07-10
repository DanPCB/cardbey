/**
 * UAF persistence — Mission.context + optional Prisma Artifact tables.
 */

import { randomUUID } from 'crypto';
import { getPrismaClient } from '../prisma.js';
import { mergeMissionContext } from '../mission.js';
import { normalizeArtifactDefinition } from './ArtifactDefinition.js';
import { normalizeArtifactBlueprint } from './ArtifactBlueprint.js';

export const UAF_CONTEXT_KEY = 'universalArtifactFactory';

/**
 * @param {string} missionId
 */
export async function loadUafMissionState(missionId) {
  if (!missionId) return { executions: [], artifacts: [], learning: [] };
  const prisma = getPrismaClient();
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { context: true },
  });
  const ctx = mission?.context && typeof mission.context === 'object' ? mission.context : {};
  const uaf = ctx[UAF_CONTEXT_KEY] && typeof ctx[UAF_CONTEXT_KEY] === 'object' ? ctx[UAF_CONTEXT_KEY] : {};
  return {
    executions: Array.isArray(uaf.executions) ? uaf.executions : [],
    artifacts: Array.isArray(uaf.artifacts) ? uaf.artifacts : [],
    learning: Array.isArray(uaf.learning) ? uaf.learning : [],
  };
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} patch
 */
export async function mergeUafMissionState(missionId, patch) {
  if (!missionId) return null;
  const current = await loadUafMissionState(missionId);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await mergeMissionContext(missionId, { [UAF_CONTEXT_KEY]: next });
  await persistArtifactRowBestEffort(missionId, next);
  return next;
}

/**
 * @param {import('./ArtifactExecution.js').ArtifactExecutionState} execution
 */
export async function persistArtifactExecution(execution) {
  const missionId = execution.definition?.missionId;
  if (!missionId) return execution;
  const state = await loadUafMissionState(missionId);
  const executions = [...state.executions.filter((e) => e.executionId !== execution.executionId), execution];
  const artifacts = [...state.artifacts];
  const existingIdx = artifacts.findIndex((a) => a.artifactId === execution.definition.artifactId);
  const artifactRecord = {
    artifactId: execution.definition.artifactId,
    type: execution.definition.type,
    objective: execution.definition.objective,
    owner: execution.definition.owner,
    storeId: execution.definition.storeId ?? null,
    status: execution.status,
    blueprint: execution.definition.blueprint,
    generated: execution.generated ?? null,
    validation: execution.validation ?? null,
    publications: execution.publications ?? null,
    updatedAt: new Date().toISOString(),
  };
  if (existingIdx >= 0) artifacts[existingIdx] = artifactRecord;
  else artifacts.push(artifactRecord);

  await mergeUafMissionState(missionId, { executions, artifacts });
  return execution;
}

/**
 * @param {Record<string, unknown>} event
 */
export async function recordArtifactLearningEvent(event) {
  const missionId = typeof event.missionId === 'string' ? event.missionId : null;
  if (!missionId) return event;
  const state = await loadUafMissionState(missionId);
  const learning = [...state.learning, { id: `learn-${randomUUID()}`, ...event }].slice(-100);
  await mergeUafMissionState(missionId, { learning });
  await persistArtifactLearningBestEffort(event);
  return event;
}

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} state
 */
async function persistArtifactRowBestEffort(missionId, state) {
  try {
    const prisma = getPrismaClient();
    if (!prisma.artifact?.upsert) return;
    for (const row of state.artifacts ?? []) {
      if (!row?.artifactId) continue;
      await prisma.artifact.upsert({
        where: { id: row.artifactId },
        create: {
          id: row.artifactId,
          type: String(row.type ?? 'unknown'),
          objective: String(row.objective ?? ''),
          ownerUserId: String(row.owner ?? ''),
          storeId: row.storeId ? String(row.storeId) : null,
          missionId,
          status: String(row.status ?? 'draft'),
          contextJson: row,
        },
        update: {
          status: String(row.status ?? 'draft'),
          contextJson: row,
          updatedAt: new Date(),
        },
      });
    }
  } catch {
    /* Prisma Artifact table optional until migration applied */
  }
}

/**
 * @param {Record<string, unknown>} event
 */
async function persistArtifactLearningBestEffort(event) {
  try {
    const prisma = getPrismaClient();
    if (!prisma.artifactLearning?.create) return;
    await prisma.artifactLearning.create({
      data: {
        id: `al-${randomUUID()}`,
        artifactId: String(event.artifactId ?? ''),
        missionId: event.missionId ? String(event.missionId) : null,
        storeId: event.storeId ? String(event.storeId) : null,
        payloadJson: event,
      },
    });
  } catch {
    /* optional table */
  }
}

/**
 * @param {unknown} raw
 */
export function normalizePersistedArtifact(raw) {
  const definition = normalizeArtifactDefinition(raw);
  if (!definition) return null;
  return {
    ...definition,
    blueprint: normalizeArtifactBlueprint(raw.blueprint ?? definition.blueprint),
    status: typeof raw.status === 'string' ? raw.status : 'draft',
    generated: raw.generated ?? null,
    validation: raw.validation ?? null,
  };
}
