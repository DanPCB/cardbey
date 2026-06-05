/**
 * Phase F bypass guards — opt-in closure with telemetry.
 */

import {
  isPhaseFBlockDraftStoreRunwayEnabled,
  isPhaseFBlockMcpDirectDispatchEnabled,
  isPhaseFBlockProactiveStepLegacyEnabled,
  isPhaseFRouteMcpViaFacadeEnabled,
} from './phaseFBypassFlags.js';
import { guardBrokerOrchestraStart } from './brokerRunwayGuard.js';
import { recordPhaseFBypass } from './phaseFBypassStaging.js';
import { isRuntimeStepExecutionEnabled } from '../runtime/performerRuntime/runtimeFlags.js';

/**
 * Orchestra start — measure mission-bound starts; delegate to broker guard for block.
 * @param {object} [body]
 */
export function guardPhaseFOrchestraStart(body) {
  const missionId =
    typeof body?.missionId === 'string' && body.missionId.trim()
      ? body.missionId.trim()
      : typeof body?.request?.missionId === 'string' && body.request.missionId.trim()
        ? body.request.missionId.trim()
        : null;

  if (missionId) {
    recordPhaseFBypass('orchestra_start_with_mission', { missionId });
  }

  const brokerGuard = guardBrokerOrchestraStart(body);
  if (brokerGuard.blocked) {
    recordPhaseFBypass('orchestra_start_blocked', {
      missionId: brokerGuard.missionId ?? missionId,
      code: brokerGuard.code,
    });
  }
  return brokerGuard;
}

/**
 * MCP dispatch — telemetry + optional block / facade hint.
 * @param {object} [context]
 */
export function guardPhaseFMcpDispatch(context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const runtimeOwned = ctx.runtimeOwned === true || ctx.performerRuntimeOwned === true;

  if (isPhaseFRouteMcpViaFacadeEnabled()) {
    recordPhaseFBypass('mcp_facade_dispatch', {
      toolName: ctx.toolName ?? null,
      storeId: ctx.storeId ?? null,
    });
    return { blocked: false, useFacade: true, runtimeOwned };
  }

  recordPhaseFBypass('mcp_direct_dispatch', {
    source: ctx.executionSource ?? ctx.source ?? 'mcp',
    storeId: ctx.storeId ?? null,
    runtimeOwned,
  });

  if (isPhaseFBlockMcpDirectDispatchEnabled() && !runtimeOwned) {
    recordPhaseFBypass('mcp_dispatch_blocked', { source: 'external_mcp_client' });
    return {
      blocked: true,
      useFacade: false,
      code: 'PHASE_F_MCP_DIRECT_DISPATCH_BLOCKED',
      message:
        'MCP direct tool dispatch is disabled. Enable PHASE_F_ROUTE_MCP_VIA_FACADE or runtime ownership.',
    };
  }

  return { blocked: false, useFacade: false, runtimeOwned };
}

/**
 * Proactive-step legacy fallback — block when kernel step execution unavailable.
 */
export function guardPhaseFProactiveStepLegacy() {
  if (isRuntimeStepExecutionEnabled()) {
    return { blocked: false, reason: 'kernel_active' };
  }

  recordPhaseFBypass('proactive_step_legacy', { path: 'executeProactiveRunwayStep' });

  if (!isPhaseFBlockProactiveStepLegacyEnabled()) {
    return { blocked: false, reason: 'legacy_allowed' };
  }

  recordPhaseFBypass('proactive_step_legacy_blocked', {});
  return {
    blocked: true,
    code: 'PHASE_F_PROACTIVE_STEP_LEGACY_BLOCKED',
    message:
      'Legacy proactive-step execution is disabled. Enable ENABLE_RUNTIME_STEP_EXECUTION or unset PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY.',
  };
}

/**
 * Draft-store direct mutation — telemetry; optional block when no mission context.
 * @param {{ route: string; missionId?: string|null; draftId?: string|null; action?: string }} input
 */
export function guardPhaseFDraftStoreRunway(input) {
  const route = typeof input?.route === 'string' ? input.route : 'unknown';
  const missionId =
    typeof input?.missionId === 'string' && input.missionId.trim() ? input.missionId.trim() : null;

  if (!missionId) {
    recordPhaseFBypass('draft_store_direct_mutation', {
      route,
      draftId: input?.draftId ?? null,
      action: input?.action ?? null,
    });
  }

  if (isPhaseFBlockDraftStoreRunwayEnabled() && !missionId) {
    recordPhaseFBypass('draft_store_runway_blocked', { route });
    return {
      blocked: true,
      code: 'PHASE_F_DRAFT_STORE_RUNWAY_BLOCKED',
      message:
        'Draft-store mutation without mission context is disabled. Run via Mission Execution or provide missionId.',
    };
  }

  return { blocked: false, missionId };
}

/**
 * Extract mission id from request headers/body for draft-store telemetry.
 * @param {import('express').Request} req
 */
export function extractMissionIdFromDraftRequest(req) {
  const header =
    typeof req.headers['x-mission-id'] === 'string'
      ? req.headers['x-mission-id'].trim()
      : typeof req.headers['x-cardbey-mission-id'] === 'string'
        ? req.headers['x-cardbey-mission-id'].trim()
        : '';
  if (header) return header;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (typeof body.missionId === 'string' && body.missionId.trim()) return body.missionId.trim();
  if (typeof body.activeMissionId === 'string' && body.activeMissionId.trim()) {
    return body.activeMissionId.trim();
  }
  return null;
}
