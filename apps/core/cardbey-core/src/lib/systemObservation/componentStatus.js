/**
 * Resolves live status for each registry component (registry = single source of truth).
 */

import {
  computeRegistryBaseline,
  docStatusToLiveStatus,
  getComponentRegistry,
} from './componentRegistry.js';
import {
  isEnvTruthy,
  probeDatabase,
  probeProductTools,
  probeSse,
  probeToolCategory,
  probeToolRegistryTotal,
} from './probes/index.js';
import {
  probeEpisodicMemory,
  probeFrontendHeartbeat,
  probeLearningHealth,
  probeMemoryFacade,
  probeMemoryStoreDeep,
  probeMissionOrchestratorDeep,
  probeRagStore,
  probeRuntimeDiagnosticsRecency,
  probeRuntimeKernelDeep,
} from './probes/deepProbes.js';

let cachedStatuses = null;
let cachedAt = 0;

function getCacheMs() {
  const raw = Number(process.env.SYSTEM_OBSERVATION_CACHE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
}

/**
 * ENABLE_* → active when truthy. DISABLE_* → active when not truthy.
 * @param {string[]} envFlags
 */
export function areRegistryFlagsActive(envFlags) {
  if (!Array.isArray(envFlags) || envFlags.length === 0) return true;

  for (const flag of envFlags) {
    const name = String(flag || '').trim();
    if (!name) continue;
    if (name.startsWith('DISABLE_')) {
      if (isEnvTruthy(name, false)) return false;
    } else if (name.startsWith('ENABLE_')) {
      if (!isEnvTruthy(name, false)) return false;
    } else if (!isEnvTruthy(name, false)) {
      return false;
    }
  }
  return true;
}

function flagGatedMessage(component) {
  const flags = component.envFlags?.length ? component.envFlags.join(', ') : 'feature flag';
  return `Flag-gated off by default (${flags})`;
}

/**
 * @param {import('./componentRegistry.js').ComponentRegistryEntry} component
 */
async function runHealthCheck(component) {
  const config = component.healthCheckConfig ?? {};
  const baselineStatus = docStatusToLiveStatus(component.docStatus);

  switch (component.healthCheck) {
    case 'database':
      return probeDatabase();
    case 'sse':
      return probeSse();
    case 'tool_registry':
      return probeToolRegistryTotal();
    case 'tool_count':
      return probeToolCategory(String(config.category || 'store'));
    case 'product_tools':
      return probeProductTools();
    case 'runtime_kernel':
      return probeRuntimeKernelDeep();
    case 'runtime_diagnostics':
      return probeRuntimeDiagnosticsRecency();
    case 'memory_store':
      return probeMemoryStoreDeep();
    case 'learning':
      return probeLearningHealth();
    case 'rag_store':
      return probeRagStore();
    case 'episodic_memory':
      return probeEpisodicMemory();
    case 'memory_facade':
      return probeMemoryFacade();
    case 'context_engine':
      if (!areRegistryFlagsActive(component.envFlags)) {
        return {
          status: 'down',
          latency: null,
          message: 'Disabled by DISABLE_CONTEXT_ENGINE flag',
        };
      }
      return { status: 'running', latency: null, message: 'OK' };
    case 'frontend_heartbeat':
      return probeFrontendHeartbeat({
        surface: component.id,
        docStatus: component.docStatus,
        notes: component.description,
      });
    case 'flag_gated': {
      if (areRegistryFlagsActive(component.envFlags)) {
        if (component.id === 'mission_orchestrator') {
          return probeMissionOrchestratorDeep();
        }
        if (component.id === 'skills_api') {
          const cap = isEnvTruthy('ENABLE_RUNTIME_SKILL_RUNTIME', false);
          return cap
            ? { status: 'running', latency: null, message: 'Skill runtime enabled' }
            : {
                status: 'degraded',
                latency: null,
                message: flagGatedMessage(component),
              };
        }
        return { status: 'running', latency: null, message: 'OK' };
      }
      return {
        status: 'degraded',
        latency: null,
        message: flagGatedMessage(component),
      };
    }
    case 'deprecated':
      return {
        status: 'degraded',
        latency: null,
        message: component.description,
      };
    case 'distributed':
      return {
        status: 'degraded',
        latency: null,
        message: component.description,
      };
    case 'placeholder':
      return {
        status: 'down',
        latency: null,
        message: component.description,
      };
    case 'always_running':
    default:
      return {
        status: baselineStatus === 'down' ? 'down' : baselineStatus,
        latency: null,
        message: component.docStatus === 'running' ? 'OK' : component.description,
      };
  }
}

/**
 * @param {import('./componentRegistry.js').ComponentRegistryEntry} component
 */
async function resolveComponentStatus(component) {
  try {
    let liveStatus = docStatusToLiveStatus(component.docStatus);
    let message = component.description;
    let latency = null;
    let details = { healthCheck: component.healthCheck ?? 'baseline' };

    if (component.docStatus === 'placeholder') {
      return {
        id: component.id,
        name: component.name,
        layer: component.layer,
        status: 'down',
        docStatus: 'placeholder',
        latency: null,
        message: component.description,
        description: component.description,
        dependencies: component.dependencies ?? [],
        envFlags: component.envFlags ?? [],
        details,
        updatedAt: new Date().toISOString(),
      };
    }

    if (component.envFlags?.length && !areRegistryFlagsActive(component.envFlags)) {
      liveStatus = 'degraded';
      message = flagGatedMessage(component);
    } else {
      const health = await runHealthCheck(component);
      if (health?.status) liveStatus = health.status;
      if (health?.message) message = health.message;
      if (health?.latency != null) latency = health.latency;
      if (health?.details) details = { ...details, ...health.details };
    }

    return {
      id: component.id,
      name: component.name,
      layer: component.layer,
      status: liveStatus,
      docStatus: component.docStatus,
      latency,
      message,
      description: component.description,
      dependencies: component.dependencies ?? [],
      envFlags: component.envFlags ?? [],
      details,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      id: component.id,
      name: component.name,
      layer: component.layer,
      status: docStatusToLiveStatus(component.docStatus),
      docStatus: component.docStatus,
      latency: null,
      message: error?.message || 'Probe failed',
      description: component.description,
      dependencies: component.dependencies ?? [],
      envFlags: component.envFlags ?? [],
      details: { error: true },
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * @param {{ bypassCache?: boolean }} [options]
 */
export async function getComponentStatuses(options = {}) {
  const now = Date.now();
  const cacheMs = getCacheMs();
  if (!options.bypassCache && cachedStatuses && now - cachedAt < cacheMs) {
    return cachedStatuses;
  }

  const registry = getComponentRegistry();
  const results = [];

  for (const component of registry) {
    results.push(await resolveComponentStatus(component));
  }

  cachedStatuses = results;
  cachedAt = now;
  return results;
}

export function resetSystemObservationCacheForTests() {
  cachedStatuses = null;
  cachedAt = 0;
}

export function buildStatusSummary(statuses) {
  return {
    total: statuses.length,
    running: statuses.filter((s) => s.status === 'running').length,
    degraded: statuses.filter((s) => s.status === 'degraded').length,
    down: statuses.filter((s) => s.status === 'down').length,
  };
}

export function buildDocBaselineSummary(registry = getComponentRegistry()) {
  return computeRegistryBaseline(registry);
}
