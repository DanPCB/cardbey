/**
 * Phase 3 — deeper System Observation probes (DB-backed, runtime recency, heartbeat).
 */

import prisma from '../../prisma.js';
import { listRecentRuntimeDiagnostics } from '../../runtimeDiagnostics/index.js';
import { getRuntimeCapabilities, isRuntimeCapabilityEnabled } from '../../runtime/runtimeCapabilitiesService.js';
import { isEnvTruthy } from './index.js';
import {
  getFrontendHeartbeat,
  isFrontendHeartbeatStale,
} from '../frontendHeartbeatStore.js';
import { computeRegistryBaseline } from '../componentRegistry.js';

function parseAgeMs(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
}

/**
 * @param {{ docStatus?: string; notes?: string; surface?: string }} [config]
 */
export function probeFrontendHeartbeat(config = {}) {
  const surfaceKey = String(config.surface || '');
  const docStatus = config.docStatus || 'running';

  if (docStatus === 'placeholder') {
    return {
      status: 'down',
      latency: null,
      message: config.notes || 'Placeholder',
      details: { surface: surfaceKey },
    };
  }

  const heartbeat = getFrontendHeartbeat();

  if (!heartbeat) {
    return {
      status: docStatus === 'partial' ? 'degraded' : 'degraded',
      latency: null,
      message: 'Awaiting Control Center heartbeat',
      details: { surface: surfaceKey, heartbeat: false },
    };
  }

  if (isFrontendHeartbeatStale()) {
    return {
      status: 'degraded',
      latency: null,
      message: 'Dashboard heartbeat stale (>5m)',
      details: {
        surface: surfaceKey,
        lastReceived: heartbeat.receivedAt,
        commitSha: heartbeat.commitSha ?? null,
      },
    };
  }

  const surface = heartbeat.surfaces?.[surfaceKey];
  if (!surface) {
    return {
      status: docStatus === 'partial' ? 'degraded' : docStatus === 'placeholder' ? 'down' : 'running',
      latency: null,
      message: config.notes || 'Surface not reported in heartbeat (doc baseline)',
      details: { surface: surfaceKey, commitSha: heartbeat.commitSha ?? null },
    };
  }

  if (surface.available === false) {
    return {
      status: 'down',
      latency: null,
      message: surface.note || `Surface unavailable (${surface.route || surfaceKey})`,
      details: { surface: surfaceKey, route: surface.route ?? null },
    };
  }

  const sha = heartbeat.commitSha && heartbeat.commitSha !== 'unknown' ? heartbeat.commitSha.slice(0, 8) : null;
  const liveStatus = docStatus === 'partial' ? 'degraded' : 'running';
  return {
    status: liveStatus,
    latency: null,
    message: sha ? `Heartbeat OK · build ${sha}` : 'Heartbeat OK',
    details: {
      surface: surfaceKey,
      route: surface.route ?? null,
      commitSha: heartbeat.commitSha ?? null,
      environment: heartbeat.environment ?? null,
    },
  };
}

export async function probeLearningHealth() {
  const start = Date.now();
  try {
    const [feedbackCount, patternCount, profileCount] = await Promise.all([
      prisma.userFeedback.count(),
      prisma.behaviorPattern.count(),
      prisma.userProfile.count(),
    ]);
    const latency = Date.now() - start;
    return {
      status: 'running',
      latency,
      message: `Learning API healthy · ${feedbackCount} feedback rows`,
      details: { feedbackCount, patternCount, profileCount },
    };
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - start,
      message: error?.message || 'Learning health probe failed',
    };
  }
}

export async function probeRagStore() {
  const start = Date.now();
  try {
    const count = await prisma.ragChunk.count();
    const latency = Date.now() - start;
    if (count > 0) {
      return {
        status: 'running',
        latency,
        message: `${count} indexed chunk${count === 1 ? '' : 's'}`,
        details: { chunkCount: count },
      };
    }
    return {
      status: 'degraded',
      latency,
      message: 'RagChunk table reachable; no indexed chunks yet',
      details: { chunkCount: 0 },
    };
  } catch (error) {
    return {
      status: 'degraded',
      latency: Date.now() - start,
      message: error?.message || 'RAG store probe failed',
      details: { error: true },
    };
  }
}

export async function probeRagService() {
  const start = Date.now();
  const flagOn = isEnvTruthy('ENABLE_RAG_IN_REASONER', false);
  const store = await probeRagStore();
  const latency = Date.now() - start;

  if (flagOn && store.status === 'running') {
    return {
      status: 'running',
      latency,
      message: 'RAG enabled in reasoner with indexed chunks',
      details: { ...(store.details ?? {}), reasonerFlag: true },
    };
  }

  if (flagOn && store.details?.chunkCount === 0) {
    return {
      status: 'degraded',
      latency,
      message: 'Reasoner RAG flag on; no indexed chunks yet',
      details: { reasonerFlag: true, chunkCount: 0 },
    };
  }

  if (!flagOn && (store.details?.chunkCount ?? 0) > 0) {
    return {
      status: 'degraded',
      latency,
      message: 'Chunks indexed; ENABLE_RAG_IN_REASONER off by default',
      details: { reasonerFlag: false, chunkCount: store.details?.chunkCount ?? 0 },
    };
  }

  return {
    status: 'degraded',
    latency,
    message: flagOn ? store.message : 'Schema present; reasoner flag off by default',
    details: { reasonerFlag: flagOn, chunkCount: store.details?.chunkCount ?? 0 },
  };
}

export function probeRuntimeDiagnosticsRecency() {
  const start = Date.now();
  try {
    const rows = listRecentRuntimeDiagnostics({ limit: 30, severity: 'error' });
    const windowMs = 15 * 60 * 1000;
    const recent = rows.filter((row) => parseAgeMs(row.createdAt) <= windowMs);
    const critical = recent.filter((row) => row.severity === 'critical' || row.severity === 'error');

    if (critical.length >= 5) {
      return {
        status: 'degraded',
        latency: Date.now() - start,
        message: `${critical.length} runtime errors in last 15m`,
        details: { recentErrors: critical.length, sample: critical[0]?.eventName ?? null },
      };
    }

    if (critical.length > 0) {
      return {
        status: 'running',
        latency: Date.now() - start,
        message: `${critical.length} runtime error${critical.length === 1 ? '' : 's'} in last 15m`,
        details: { recentErrors: critical.length },
      };
    }

    return {
      status: 'running',
      latency: Date.now() - start,
      message: 'No recent runtime diagnostic errors',
      details: { recentErrors: 0 },
    };
  } catch (error) {
    return {
      status: 'degraded',
      latency: null,
      message: error?.message || 'Runtime diagnostics probe failed',
    };
  }
}

export async function probeRuntimeKernelDeep() {
  const mode = String(process.env.EXECUTION_MODE || 'kernel').trim().toLowerCase();
  const caps = getRuntimeCapabilities();
  const kernelOn = mode === 'kernel' || caps?.runtimeKernel;
  const diagnostics = probeRuntimeDiagnosticsRecency();

  if (!kernelOn) {
    return {
      status: 'degraded',
      latency: diagnostics.latency,
      message: `Non-kernel execution mode (${mode || 'unknown'})`,
      details: { executionMode: mode, ...(diagnostics.details ?? {}) },
    };
  }

  if (diagnostics.status === 'degraded') {
    return {
      status: 'degraded',
      latency: diagnostics.latency,
      message: `Kernel active · ${diagnostics.message}`,
      details: { executionMode: mode, runtimeKernel: true, ...(diagnostics.details ?? {}) },
    };
  }

  return {
    status: 'running',
    latency: diagnostics.latency,
    message: `EXECUTION_MODE=${mode || 'kernel'} · ${diagnostics.message}`,
    details: { executionMode: mode, runtimeKernel: true, ...(diagnostics.details ?? {}) },
  };
}

export function probeMissionOrchestratorDeep() {
  const flagOn = isEnvTruthy('ENABLE_RUNTIME_MISSION_ORCHESTRATOR', false);
  const capOn = isRuntimeCapabilityEnabled('runtimeMissionOrchestrator');

  if (flagOn && capOn) {
    return {
      status: 'running',
      latency: null,
      message: 'Mission orchestrator enabled',
      details: { flag: true, capability: true },
    };
  }

  if (flagOn && !capOn) {
    return {
      status: 'degraded',
      latency: null,
      message: 'Flag on but runtimeMissionOrchestrator capability missing',
      details: { flag: true, capability: false },
    };
  }

  return {
    status: 'degraded',
    latency: null,
    message: 'Flag-gated off by default',
    details: { flag: false, capability: capOn },
  };
}

export async function probeEpisodicMemory() {
  const start = Date.now();
  try {
    const count = await prisma.missionBlackboard.count();
    const latency = Date.now() - start;
    return {
      status: 'running',
      latency,
      message: `${count} blackboard event${count === 1 ? '' : 's'} persisted`,
      details: { eventCount: count },
    };
  } catch (error) {
    const msg = error?.message || '';
    if (msg.includes('does not exist') || msg.includes('no such table')) {
      return {
        status: 'degraded',
        latency: Date.now() - start,
        message: 'MissionBlackboard table not migrated',
      };
    }
    return {
      status: 'down',
      latency: null,
      message: msg || 'Episodic memory probe failed',
    };
  }
}

export async function probeMemoryFacade() {
  const start = Date.now();
  try {
    const mod = await import('../../../services/memory/memoryFacade.js');
    const ok = Boolean(mod?.default?.getBundle || mod?.getBundle);
    return {
      status: ok ? 'running' : 'degraded',
      latency: Date.now() - start,
      message: ok ? 'Memory facade module loaded' : 'Memory facade export missing',
    };
  } catch (error) {
    return {
      status: 'degraded',
      latency: Date.now() - start,
      message: error?.message || 'Memory facade probe failed',
    };
  }
}

export async function probeMemoryStoreDeep() {
  const start = Date.now();
  try {
    const [contextCount, feedbackCount, blackboardCount] = await Promise.all([
      prisma.performerSessionContext.count().catch(() => null),
      prisma.userFeedback.count().catch(() => null),
      prisma.missionBlackboard.count().catch(() => null),
    ]);
    const latency = Date.now() - start;
    const tables = [contextCount, feedbackCount, blackboardCount].filter((v) => v != null).length;
    if (tables === 0) {
      return {
        status: 'degraded',
        latency,
        message: 'Memory tables unavailable',
      };
    }
    return {
      status: 'running',
      latency,
      message: 'Context, learning, and blackboard tables reachable',
      details: { contextCount, feedbackCount, blackboardCount },
    };
  } catch (error) {
    return {
      status: 'degraded',
      latency: Date.now() - start,
      message: error?.message || 'Memory store probe failed',
    };
  }
}

export function computeDocBaselineFromRegistry(registry) {
  return computeRegistryBaseline(registry);
}
