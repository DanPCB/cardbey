/**
 * Runtime Authority Guard — Sprint 1 enforcement.
 * dispatchTool must only run under Performer Runtime ownership context.
 */

import { emitHealthProbe } from '../../telemetry/healthProbes.js';
import {
  incrementRuntimeAuthorityMetric,
  recordRuntimeBypass,
} from './runtimeAuthorityStaging.js';

const PATH_USED_PROBE = 'broker.runtime.authority.path_used';
const BYPASS_PROBE = 'broker.runtime.authority.bypass';

/**
 * @param {object} [ctx]
 * @returns {boolean}
 */
export function hasRuntimeAuthorityContext(ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return c.runtimeOwned === true || c.performerRuntimeOwned === true;
}

/**
 * @returns {string}
 */
export function captureCallerStack() {
  const err = new Error('runtime_authority_stack');
  const stack = typeof err.stack === 'string' ? err.stack : '';
  const lines = stack.split('\n').slice(2, 12);
  return lines.join('\n').trim();
}

/**
 * @param {{
 *   route?: string|null;
 *   toolName?: string|null;
 *   userId?: string|null;
 *   missionId?: string|null;
 *   source?: string|null;
 *   [key: string]: unknown;
 * }} fields
 */
export function recordRuntimeAuthorityPathUsed(fields = {}) {
  incrementRuntimeAuthorityMetric('runtimeAuthorityPathUsed');
  emitHealthProbe(PATH_USED_PROBE, {
    status: 'pass',
    event: 'RUNTIME_AUTHORITY_PATH_USED',
    route: fields.route ?? null,
    toolName: fields.toolName ?? null,
    userId: fields.userId ?? null,
    missionId: fields.missionId ?? null,
    source: fields.source ?? null,
    ...fields,
  });
}

/**
 * @param {{
 *   caller?: string|null;
 *   toolName?: string|null;
 *   route?: string|null;
 *   userId?: string|null;
 *   missionId?: string|null;
 *   stack?: string|null;
 *   [key: string]: unknown;
 * }} fields
 */
export function recordRuntimeAuthorityBypass(fields = {}) {
  incrementRuntimeAuthorityMetric('runtimeAuthorityBypass');
  recordRuntimeBypass('runtime_authority_bypass', {
    event: 'RUNTIME_AUTHORITY_BYPASS',
    caller: fields.caller ?? null,
    toolName: fields.toolName ?? null,
    route: fields.route ?? null,
    userId: fields.userId ?? null,
    missionId: fields.missionId ?? null,
    stack: fields.stack ?? captureCallerStack(),
    ...fields,
  });
  emitHealthProbe(BYPASS_PROBE, {
    status: 'warn',
    event: 'RUNTIME_AUTHORITY_BYPASS',
    caller: fields.caller ?? null,
    toolName: fields.toolName ?? null,
    route: fields.route ?? null,
    userId: fields.userId ?? null,
    missionId: fields.missionId ?? null,
    stack: fields.stack ?? captureCallerStack(),
    ...fields,
  });
}

/**
 * Assert dispatchTool is called under runtime authority.
 * Development: throw RUNTIME_AUTHORITY_BYPASS.
 * Production / test: warn + telemetry (ownership block remains separate).
 *
 * @param {object} [ctx]
 * @param {{
 *   caller?: string|null;
 *   toolName?: string|null;
 *   route?: string|null;
 *   userId?: string|null;
 *   missionId?: string|null;
 *   source?: string|null;
 * }} [meta]
 */
export function assertRuntimeAuthorityContext(ctx, meta = {}) {
  if (hasRuntimeAuthorityContext(ctx)) {
    recordRuntimeAuthorityPathUsed({
      route: meta.route ?? null,
      toolName: meta.toolName ?? null,
      userId: meta.userId ?? ctx?.userId ?? null,
      missionId: meta.missionId ?? ctx?.missionId ?? ctx?.activeMissionId ?? null,
      source: meta.source ?? ctx?.source ?? meta.caller ?? 'dispatch_tool',
    });
    return { ok: true };
  }

  const stack = captureCallerStack();
  recordRuntimeAuthorityBypass({
    caller: meta.caller ?? ctx?.source ?? 'dispatch_tool',
    toolName: meta.toolName ?? null,
    route: meta.route ?? null,
    userId: meta.userId ?? ctx?.userId ?? null,
    missionId: meta.missionId ?? ctx?.missionId ?? ctx?.activeMissionId ?? null,
    stack,
  });

  const toolLabel = meta.toolName ?? 'unknown';
  const message = `RUNTIME_AUTHORITY_BYPASS: dispatchTool(${toolLabel}) without runtime authority`;

  if (process.env.NODE_ENV === 'development') {
    const err = new Error(message);
    err.code = 'RUNTIME_AUTHORITY_BYPASS';
    throw err;
  }

  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[RuntimeAuthorityGuard] ${message}`, {
      caller: meta.caller ?? ctx?.source ?? null,
      toolName: meta.toolName ?? null,
      route: meta.route ?? null,
    });
  }

  return { ok: false, warned: true };
}
