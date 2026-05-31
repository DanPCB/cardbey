/**
 * Phase 2.3-C — RuntimeSnapshot read model (mission-scoped materialized runtime view).
 *
 * Composes mission status, runtime/orchestration state, recent blackboard events,
 * reasoning/execution/governance summaries, coordination pressure, active agents, latest artifacts.
 *
 * Hard separation: read-only. Does NOT import dispatchTool / executeMissionAction /
 * performerRuntime.execute / pipeline mutation modules. Tolerates partial data; never throws.
 */

import { getEvents } from '../../missionBlackboard.js';
import {
  isPerformerAgentGovernanceEnabled,
  isPerformerOrchestrationStabilityEnabled,
} from '../../broker/brokerFlags.js';
import { coalesce } from './runtimeQueryCoalescer.js';
import { getCachedSnapshot, setCachedSnapshot, getReplaySince } from './missionRuntimeSnapshotCache.js';
import { recordSnapshotBuild } from './runtimeObservabilityMetrics.js';

const DEFAULT_EVENT_WINDOW = 50;
const MAX_EVENT_WINDOW = 300;

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function clampWindow(n) {
  const x = typeof n === 'number' ? n : parseInt(String(n ?? ''), 10);
  if (!Number.isFinite(x) || x <= 0) return DEFAULT_EVENT_WINDOW;
  return Math.min(MAX_EVENT_WINDOW, x);
}

function summarizeReasoning(events) {
  const reasoning = events.filter((e) => /reasoning|reflection|thought/i.test(e.eventType));
  const last = reasoning.length ? reasoning[reasoning.length - 1] : null;
  return {
    count: reasoning.length,
    lastEventType: last?.eventType ?? null,
    lastAt: last?.createdAt ?? null,
  };
}

function summarizeExecution(events) {
  const exec = events.filter((e) =>
    /execution|dispatch|tool_|step_|runtime\.execution|agent_completed|agent_failed/i.test(e.eventType),
  );
  const failures = exec.filter((e) => /fail/i.test(e.eventType)).length;
  const completions = exec.filter((e) => /complet|done|success/i.test(e.eventType)).length;
  return {
    count: exec.length,
    completions,
    failures,
    lastEventType: exec.length ? exec[exec.length - 1].eventType : null,
  };
}

function deriveActiveAgents(events) {
  const assigned = new Map();
  for (const e of events) {
    const p = e.payload && typeof e.payload === 'object' ? e.payload : {};
    const agentType = typeof p.agentType === 'string' ? p.agentType : null;
    const taskId = typeof p.taskId === 'string' ? p.taskId : null;
    if (!agentType) continue;
    if (e.eventType === 'agent_assigned' && taskId) {
      assigned.set(taskId, { agentType, taskId, status: 'active' });
    } else if ((e.eventType === 'agent_completed' || e.eventType === 'agent_failed') && taskId) {
      assigned.set(taskId, {
        agentType,
        taskId,
        status: e.eventType === 'agent_completed' ? 'completed' : 'failed',
      });
    }
  }
  return [...assigned.values()];
}

function deriveLatestArtifacts(events, limit = 5) {
  const artifacts = events
    .filter((e) => /artifact|mission\.artifact|orchestration_complete|draft|output/i.test(e.eventType))
    .slice(-limit)
    .map((e) => ({
      eventType: e.eventType,
      seq: e.seq ?? null,
      at: e.createdAt ?? null,
    }));
  return artifacts;
}

function deriveOrchestrationState(events) {
  const halted = events.some((e) => e.eventType === 'orchestration_halted');
  const complete = events.some((e) => e.eventType === 'orchestration_complete');
  const spawnQueued = events.filter((e) => e.eventType === 'agent_spawn_queued').length;
  return {
    halted,
    complete,
    spawnQueued,
    state: complete ? 'complete' : halted ? 'halted' : spawnQueued > 0 ? 'spawning' : 'active',
  };
}

async function loadMissionState(missionId) {
  try {
    const mod = await import('../../missionPipelineResolver.js');
    if (typeof mod.resolveMissionState === 'function') {
      const st = await mod.resolveMissionState(missionId);
      if (st) {
        return {
          status: st.status ?? null,
          runState: st.runState ?? null,
          type: st.type ?? null,
          title: st.title ?? null,
          progress: st.progress ?? null,
          currentStep: st.currentStep ?? null,
          activeCheckpoint: st.activeCheckpoint ?? null,
        };
      }
    }
  } catch (e) {
    // tolerate — partial snapshot still useful
  }
  return null;
}

async function loadGovernance(missionId, eventWindow) {
  if (!isPerformerAgentGovernanceEnabled()) return null;
  try {
    const [{ buildCoordinationGraph }, { summarizeGovernance }, { computeCoordinationPressure }] = await Promise.all([
      import('../../broker/coordinationGraph/buildCoordinationGraph.js'),
      import('../../broker/coordinationGraph/governanceScoring.js'),
      import('../../broker/coordinationGraph/coordinationPressure.js'),
    ]);
    const graph = await buildCoordinationGraph(missionId, { limit: Math.max(eventWindow, 100) });
    return {
      governance: summarizeGovernance(graph),
      coordinationPressure: computeCoordinationPressure(graph),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Build (or reuse cached) RuntimeSnapshot for a mission.
 * @param {string} missionId
 * @param {{ eventWindow?: number, force?: boolean, afterSeq?: number }} [opts]
 */
export async function buildRuntimeSnapshot(missionId, opts = {}) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) {
    return { ok: false, error: 'mission_id_required', executable: false, advisoryMode: 'read_only' };
  }

  if (!opts.force) {
    const cached = getCachedSnapshot(mid);
    if (cached) return cached;
  }

  const eventWindow = clampWindow(opts.eventWindow);

  return coalesce(`runtime-snapshot:${mid}:${eventWindow}`, async () => {
    const startedAt = Date.now();
    let events = [];
    try {
      const res = await getEvents(mid, { limit: eventWindow });
      events = asArray(res?.events);
    } catch (e) {
      events = [];
    }

    const latestSeq = events.length ? events[events.length - 1].seq ?? 0 : 0;
    const byType = {};
    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    }

    const missionState = await loadMissionState(mid);
    const governance = await loadGovernance(mid, eventWindow);
    const replay = getReplaySince(mid, opts.afterSeq ?? 0);

    const snapshot = {
      ok: true,
      executable: false,
      advisoryMode: 'read_only',
      phase: '2.3-C',
      missionId: mid,
      builtAt: new Date().toISOString(),
      latestSeq,
      missionStatus: missionState?.status ?? null,
      runtimeState: missionState?.runState ?? null,
      missionType: missionState?.type ?? null,
      title: missionState?.title ?? null,
      progress: missionState?.progress ?? null,
      currentStep: missionState?.currentStep ?? null,
      activeCheckpoint: missionState?.activeCheckpoint ?? null,
      orchestrationState: deriveOrchestrationState(events),
      recentEvents: events.slice(-eventWindow).map((e) => ({
        seq: e.seq ?? null,
        eventType: e.eventType,
        agentId: e.agentId ?? null,
        at: e.createdAt ?? null,
      })),
      eventCounts: byType,
      reasoningSummary: summarizeReasoning(events),
      executionSummary: summarizeExecution(events),
      governanceSummary: governance?.governance ?? null,
      coordinationPressure: governance?.coordinationPressure ?? null,
      activeAgents: deriveActiveAgents(events),
      latestArtifacts: deriveLatestArtifacts(events),
      replay: {
        available: replay.replayAvailable,
        bufferedEvents: replay.events.length,
        lastSeq: replay.lastSeq,
      },
      stabilityEnabled: isPerformerOrchestrationStabilityEnabled(),
    };

    recordSnapshotBuild({ latencyMs: Date.now() - startedAt });
    setCachedSnapshot(mid, snapshot);
    return snapshot;
  });
}
