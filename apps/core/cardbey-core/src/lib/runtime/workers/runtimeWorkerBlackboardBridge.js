/**
 * Worker + skill lifecycle blackboard bridge (Phase D).
 */

import { appendEvent } from '../../missionBlackboard.js';

export async function emitWorkerLifecycleEvent(missionId, eventType, payload, traceId = null) {
  try {
    await appendEvent(missionId, eventType, payload, traceId ? { traceId } : {});
  } catch (e) {
    console.warn(`[WorkerBlackboard] ${eventType} emit failed:`, e?.message || e);
  }
}

export async function emitWorkerStarted(missionId, worker, workerContext, traceId) {
  return emitWorkerLifecycleEvent(
    missionId,
    'runtime.worker.started',
    {
      workerId: worker.workerId,
      nodeId: worker.nodeId,
      graphId: worker.graphId,
      skillId: worker.assignedSkill?.skillId ?? null,
    },
    traceId,
  );
}

export async function emitWorkerHeartbeat(missionId, worker, traceId) {
  return emitWorkerLifecycleEvent(
    missionId,
    'runtime.worker.heartbeat',
    {
      workerId: worker.workerId,
      nodeId: worker.nodeId,
      heartbeatAt: worker.heartbeatAt,
    },
    traceId,
  );
}

export async function emitWorkerCompleted(missionId, worker, traceId) {
  return emitWorkerLifecycleEvent(
    missionId,
    'runtime.worker.completed',
    {
      workerId: worker.workerId,
      nodeId: worker.nodeId,
      skillId: worker.assignedSkill?.skillId ?? null,
    },
    traceId,
  );
}

export async function emitWorkerFailed(missionId, worker, reason, traceId) {
  return emitWorkerLifecycleEvent(
    missionId,
    'runtime.worker.failed',
    {
      workerId: worker.workerId,
      nodeId: worker.nodeId,
      skillId: worker.assignedSkill?.skillId ?? null,
      reason,
    },
    traceId,
  );
}

export async function emitSkillExecuting(missionId, skill, node, workerId, traceId) {
  return emitWorkerLifecycleEvent(
    missionId,
    'runtime.skill.executing',
    {
      skillId: skill.skillId,
      skillType: skill.skillType,
      nodeId: node.nodeId,
      workerId,
      assignedTool: node.assignedTool ?? null,
    },
    traceId,
  );
}

export async function emitSkillCompleted(missionId, skill, node, workerId, traceId) {
  return emitWorkerLifecycleEvent(
    missionId,
    'runtime.skill.completed',
    {
      skillId: skill.skillId,
      skillType: skill.skillType,
      nodeId: node.nodeId,
      workerId,
    },
    traceId,
  );
}

export default {
  emitWorkerLifecycleEvent,
  emitWorkerStarted,
  emitWorkerHeartbeat,
  emitWorkerCompleted,
  emitWorkerFailed,
  emitSkillExecuting,
  emitSkillCompleted,
};
