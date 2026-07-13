/**
 * Multi-agent orchestration governance — confirmation gates and server-side audit traces.
 * Aligns with PIL: Observe → Infer → Suggest → Confirm → Execute.
 */

import { Features } from '../../config/features.js';

export const ORCHESTRATION_MISSION_TYPES = new Set(['multi_agent', 'campaign_orchestration']);

/** Mission types that always require confirmation when governance is enabled. */
export const REQUIRES_CONFIRMATION_TYPES = [
  'multi_agent',
  'campaign_orchestration',
  'create_campaign',
  'setup_loyalty_program',
  'persist_package',
];

/** High-impact payload actions that require confirmation. */
export const HIGH_IMPACT_ACTIONS = [
  'create_campaign',
  'create_loyalty',
  'create_loyalty_program',
  'setup_loyalty_program',
  'launch_campaign',
  'persist_campaign_package',
  'persist_package',
  'execute_agent_team',
  'multi_agent_orchestration',
  'campaign_orchestration',
];

/** Tools that produce persistent artifacts and must not auto-run without confirmation. */
export const PERSISTENT_ARTIFACT_ACTIONS = new Set([
  'create_campaign',
  'setup_loyalty_program',
  'create_loyalty_program',
  'launch_campaign',
  'create_promotion',
  'package_campaign_artifact',
  'generate_campaign_graphics',
  'generate_slideshow',
  'generate_campaign_copy',
  'multi_agent_orchestration',
]);

export const MULTI_AGENT_PROPOSED_ACTION = 'multi_agent_orchestration';

const inMemoryAudit = [];
const AUDIT_MAX_ENTRIES = 200;

/**
 * @param {string | null | undefined} missionType
 * @param {string | Record<string, unknown> | null | undefined} [actionOrPayload]
 * @param {{ skipConfirmation?: boolean }} [opts]
 */
export function requiresConfirmation(missionType, actionOrPayload, opts = {}) {
  if (opts.skipConfirmation === true) return false;
  if (!Features.multiAgent.requireConfirmation) return false;

  const type = String(missionType ?? '').trim();
  if (ORCHESTRATION_MISSION_TYPES.has(type)) return true;
  if (REQUIRES_CONFIRMATION_TYPES.includes(type)) return true;

  let action = '';
  let payload = {};
  if (actionOrPayload && typeof actionOrPayload === 'object' && !Array.isArray(actionOrPayload)) {
    payload = actionOrPayload;
    action = String(payload.action ?? payload.tool ?? payload.toolName ?? '').trim();
  } else {
    action = String(actionOrPayload ?? '').trim();
  }

  if (action && HIGH_IMPACT_ACTIONS.includes(action)) return true;
  if (action && PERSISTENT_ARTIFACT_ACTIONS.has(action)) return true;
  if (payload.createArtifacts === true || payload.persistPackage === true) return true;

  return false;
}

/**
 * @param {string | null | undefined} userId
 */
export function canSkipConfirmationForUser(userId) {
  const id = String(userId ?? '').trim();
  if (!id) return false;
  return Features.multiAgent.skipConfirmationUsers.includes(id);
}

/**
 * Trusted internal override for skipConfirmation (super_admin / platform_admin only).
 *
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [body]
 */
export function isTrustedOrchestrationSkip(req, body = {}) {
  if (body.skipConfirmation !== true) return false;
  const userId = String(req.user?.id ?? req.userId ?? '').trim();
  if (canSkipConfirmationForUser(userId)) return true;
  const role = String(req.user?.role ?? req.get?.('x-performer-role') ?? '').trim();
  return role === 'super_admin' || role === 'platform_admin' || role === 'admin';
}

/**
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [body]
 * @param {{ missionType?: string, action?: string }} [ctx]
 */
export function resolveOrchestrationDispatchOptions(req, body = {}, ctx = {}) {
  const skipConfirmation = isTrustedOrchestrationSkip(req, body);
  const confirmed = body.confirmed === true;
  const missionType = String(ctx.missionType ?? body.missionType ?? '').trim();
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? body.payload
      : body;
  const action = String(
    ctx.action ?? payload.action ?? body.tool ?? body.toolName ?? missionType,
  ).trim();
  const needsConfirmation = requiresConfirmation(missionType, payload, { skipConfirmation });

  return {
    requireConfirmation: needsConfirmation,
    confirmed,
    skipConfirmation,
    source: 'agent_orchestration',
    actorId: String(req.user?.id ?? req.userId ?? req.guestId ?? '').trim() || null,
  };
}

/**
 * @param {{
 *   sourceIntent?: string;
 *   missionId?: string | null;
 *   targetId?: string | null;
 *   proposedAction?: string;
 *   confirmationState?: 'pending' | 'confirmed' | 'rejected' | 'not_required';
 *   executedBy?: string | null;
 *   missionType?: string | null;
 * }} input
 */
export function createOrchestrationGovernanceTrace(input = {}) {
  return {
    sourceIntent: String(input.sourceIntent ?? '').trim() || 'multi_agent_orchestration',
    missionId: input.missionId ?? null,
    targetId: input.targetId ?? null,
    proposedAction: input.proposedAction ?? MULTI_AGENT_PROPOSED_ACTION,
    confirmationState: input.confirmationState ?? 'pending',
    executedBy: input.executedBy ?? null,
    missionType: input.missionType ?? null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Append governance trace for server-side audit (in-memory ring buffer + optional log).
 *
 * @param {ReturnType<typeof createOrchestrationGovernanceTrace>} trace
 */
export function appendOrchestrationGovernanceTrace(trace) {
  if (!trace || typeof trace !== 'object') return trace;
  inMemoryAudit.push(trace);
  if (inMemoryAudit.length > AUDIT_MAX_ENTRIES) {
    inMemoryAudit.splice(0, inMemoryAudit.length - AUDIT_MAX_ENTRIES);
  }
  if (process.env.MULTI_AGENT_GOVERNANCE_LOG === 'true') {
    console.log('[multiAgentGovernance] trace', JSON.stringify(trace));
  }
  return trace;
}

/** @returns {ReturnType<typeof createOrchestrationGovernanceTrace>[]} */
export function getOrchestrationGovernanceAuditSnapshot() {
  return [...inMemoryAudit];
}

/** Test helper */
export function resetOrchestrationGovernanceAuditForTests() {
  inMemoryAudit.length = 0;
}
