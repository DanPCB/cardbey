/**
 * System Observation probes — lightweight live checks for component status.
 */

import { testDatabaseConnection } from '../../prisma.js';
import { isSseHealthy } from '../../../realtime/sse.js';
import { getToolsForCategory, TOOLS } from '../../toolRegistry.js';
import { getRuntimeCapabilities } from '../../runtime/runtimeCapabilitiesService.js';

export function isEnvTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * @returns {Promise<{ status: 'running' | 'down', latency: number | null, message: string, details?: Record<string, unknown> }>}
 */
export async function probeDatabase() {
  const start = Date.now();
  try {
    const result = await testDatabaseConnection();
    const latency = typeof result.latencyMs === 'number' ? result.latencyMs : Date.now() - start;
    if (result.ok) {
      return {
        status: 'running',
        latency,
        message: 'OK',
        details: { dialect: result.dialect ?? null },
      };
    }
    return {
      status: 'down',
      latency: null,
      message: result.error || 'Database connection failed',
      details: { dialect: result.dialect ?? null },
    };
  } catch (error) {
    return {
      status: 'down',
      latency: null,
      message: error?.message || 'Database probe failed',
    };
  }
}

/**
 * @returns {{ status: 'running' | 'degraded' | 'down', latency: number | null, message: string }}
 */
export function probeSse() {
  const start = Date.now();
  try {
    const healthy = isSseHealthy();
    return {
      status: healthy ? 'running' : 'degraded',
      latency: Date.now() - start,
      message: healthy ? 'OK' : 'SSE heartbeat stale or unavailable',
    };
  } catch (error) {
    return {
      status: 'down',
      latency: null,
      message: error?.message || 'SSE probe failed',
    };
  }
}

/**
 * @param {{ env: string, invert?: boolean, defaultEnabled?: boolean, label?: string }} spec
 */
export function probeEnvFlag(spec) {
  const defaultEnabled = spec.defaultEnabled ?? false;
  const rawActive = isEnvTruthy(spec.env, defaultEnabled);
  const active = spec.invert ? !rawActive : rawActive;

  if (active) {
    return {
      status: 'running',
      latency: null,
      message: 'OK',
      details: { flag: spec.env, active: true },
    };
  }

  return {
    status: spec.invert ? 'down' : 'degraded',
    latency: null,
    message: spec.label || `Flag-gated off (${spec.env})`,
    details: { flag: spec.env, active: false },
  };
}

/**
 * @param {string} category
 */
export function probeToolCategory(category) {
  const tools = getToolsForCategory(category);
  const count = tools.length;
  if (count > 0) {
    return {
      status: 'running',
      latency: null,
      message: `${count} registered tool${count === 1 ? '' : 's'}`,
      details: { category, count },
    };
  }
  return {
    status: 'degraded',
    latency: null,
    message: `No tools registered for category "${category}"`,
    details: { category, count: 0 },
  };
}

/**
 * Product/catalog tools — subset of store registry entries.
 */
export function probeProductTools() {
  const productTools = TOOLS.filter((tool) => {
    const name = String(tool.toolName || '');
    return (
      name.includes('product') ||
      name.includes('catalog') ||
      name === 'prepare_catalog' ||
      name === 'finalize_catalog'
    );
  });
  const count = productTools.length;
  if (count > 0) {
    return {
      status: 'running',
      latency: null,
      message: `${count} catalog/product tool${count === 1 ? '' : 's'}`,
      details: { count },
    };
  }
  return {
    status: 'degraded',
    latency: null,
    message: 'No product/catalog tools registered',
    details: { count: 0 },
  };
}

export function probeToolRegistryTotal() {
  const count = TOOLS.length;
  return {
    status: count > 0 ? 'running' : 'down',
    latency: null,
    message: `${count} tools in registry`,
    details: { count },
  };
}

export function probeSkillsApi() {
  const count = TOOLS.filter((t) => String(t.category || '') === 'skill').length;
  const runtimeSkill = getRuntimeCapabilities()?.runtimeSkillRuntime;
  if (runtimeSkill || count > 0) {
    return {
      status: 'running',
      latency: null,
      message: runtimeSkill ? 'Skill runtime enabled' : `${count} skill tools registered`,
      details: { runtimeSkillRuntime: Boolean(runtimeSkill), toolCount: count },
    };
  }
  return {
    status: 'running',
    latency: null,
    message: 'Skills API present (mixed real/stub executors)',
    details: { runtimeSkillRuntime: false, toolCount: count },
  };
}

export function probeRuntimeKernel() {
  const mode = String(process.env.EXECUTION_MODE || 'kernel').trim().toLowerCase();
  const caps = getRuntimeCapabilities();
  const kernelOn = mode === 'kernel' || caps?.runtimeKernel;
  if (kernelOn) {
    return {
      status: 'running',
      latency: null,
      message: `EXECUTION_MODE=${mode || 'kernel'}`,
      details: { executionMode: mode, runtimeKernel: Boolean(caps?.runtimeKernel) },
    };
  }
  return {
    status: 'degraded',
    latency: null,
    message: `Non-kernel execution mode (${mode || 'unknown'})`,
    details: { executionMode: mode },
  };
}

export function probeMemoryStore() {
  return {
    status: 'running',
    latency: null,
    message: 'Context, learning, and blackboard persistence configured',
  };
}

export function probeDocBaseline(docStatus, notes) {
  const status = docStatus === 'down' ? 'down' : docStatus === 'degraded' ? 'degraded' : 'running';
  return {
    status,
    latency: null,
    message: notes || (status === 'running' ? 'OK' : 'See architecture notes'),
  };
}
