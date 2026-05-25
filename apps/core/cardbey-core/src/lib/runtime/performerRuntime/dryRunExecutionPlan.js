/**
 * Phase 6 — dry-run execution plan validation (no real capability execution).
 */
import { randomUUID } from 'node:crypto';
import { getBrokerAction, getBrokerActionForTool } from '../../broker/actionRegistry.js';
import { recordExecutionTelemetry } from '../../broker/executionTelemetry.js';

/** Dashboard capabilityId → broker tool names (first match wins). */
const CAPABILITY_TOOL_CANDIDATES = {
  replace_catalog: ['replace_store_catalog', 'menu_replace_open'],
  publish_store: ['publish_store', 'publish_request'],
  connect_domain: ['connect_custom_domain', 'connect_domain'],
  analyze_store: ['analyze_store'],
  create_offer: ['create_offer'],
};

const KNOWN_INTENT_ACTION_TYPES = new Set([
  'update_product_catalog',
  'connect_custom_domain',
  'review_store_performance',
  'launch_first_offer',
]);

/**
 * @param {unknown} intent
 * @returns {{ ok: true, intent: object } | { ok: false, error: string }}
 */
export function validateDryRunIntent(intent) {
  if (!intent || typeof intent !== 'object') {
    return { ok: false, error: 'intent_required' };
  }
  const i = /** @type {Record<string, unknown>} */ (intent);
  const intentId = typeof i.intentId === 'string' ? i.intentId.trim() : '';
  const missionId = typeof i.missionId === 'string' ? i.missionId.trim() : '';
  const actionType = typeof i.actionType === 'string' ? i.actionType.trim() : '';
  if (!intentId) return { ok: false, error: 'intent_id_required' };
  if (!missionId) return { ok: false, error: 'intent_mission_mismatch' };
  if (!actionType) return { ok: false, error: 'intent_action_type_required' };
  if (!KNOWN_INTENT_ACTION_TYPES.has(actionType)) {
    return { ok: false, error: 'intent_action_type_unknown' };
  }
  return { ok: true, intent: i };
}

/**
 * @param {unknown} plan
 * @returns {{ ok: true, plan: object } | { ok: false, error: string }}
 */
export function validateDryRunPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return { ok: false, error: 'plan_required' };
  }
  const p = /** @type {Record<string, unknown>} */ (plan);
  const planId = typeof p.planId === 'string' ? p.planId.trim() : '';
  if (!planId) return { ok: false, error: 'plan_id_required' };
  if (!Array.isArray(p.steps)) {
    return { ok: false, error: 'plan_steps_required' };
  }
  return { ok: true, plan: p };
}

/**
 * @param {string} capabilityId
 * @param {string|undefined} toolHint
 * @returns {{ capabilityId: string, supported: boolean, tool?: string, actionId?: string, registrySource?: string }}
 */
export function resolveCapabilityAvailability(capabilityId, toolHint) {
  const capId = typeof capabilityId === 'string' ? capabilityId.trim() : '';
  if (!capId) {
    return { capabilityId: capId || 'unknown', supported: false };
  }

  const candidates = [];
  if (typeof toolHint === 'string' && toolHint.trim()) {
    candidates.push(toolHint.trim());
  }
  const mapped = CAPABILITY_TOOL_CANDIDATES[capId];
  if (Array.isArray(mapped)) candidates.push(...mapped);

  for (const tool of candidates) {
    const action = getBrokerActionForTool(tool);
    if (action) {
      return {
        capabilityId: capId,
        supported: true,
        tool,
        actionId: action.id,
        registrySource: action.registrySource,
      };
    }
  }

  const capAction = getBrokerAction(`capability:${capId}`);
  if (capAction) {
    return {
      capabilityId: capId,
      supported: true,
      tool: capAction.toolName ?? undefined,
      actionId: capAction.id,
      registrySource: capAction.registrySource,
    };
  }

  return { capabilityId: capId, supported: false };
}

/**
 * @param {{
 *   missionId: string;
 *   intent: object;
 *   plan: object;
 * }} input
 * @returns {Promise<object>}
 */
export async function dryRunExecutionPlan(input) {
  const missionId = typeof input?.missionId === 'string' ? input.missionId.trim() : '';
  if (!missionId) {
    return { ok: false, error: 'mission_id_required' };
  }

  const intentCheck = validateDryRunIntent(input?.intent);
  if (!intentCheck.ok) {
    return { ok: false, error: intentCheck.error };
  }
  const intent = intentCheck.intent;
  if (String(intent.missionId) !== missionId) {
    return { ok: false, error: 'intent_mission_mismatch' };
  }

  const planCheck = validateDryRunPlan(input?.plan);
  if (!planCheck.ok) {
    return { ok: false, error: planCheck.error };
  }
  const plan = planCheck.plan;

  const executionId = randomUUID();
  const timestamp = new Date().toISOString();
  const planStatus = typeof plan.status === 'string' ? plan.status : 'ready';

  const supportedCapabilities = [];
  const missingCapabilities = [];

  for (const step of plan.steps) {
    if (!step || typeof step !== 'object') continue;
    const s = /** @type {Record<string, unknown>} */ (step);
    const capId = typeof s.capabilityId === 'string' ? s.capabilityId : '';
    const tool = typeof s.tool === 'string' ? s.tool : undefined;
    const resolved = resolveCapabilityAvailability(capId, tool);
    if (resolved.supported) {
      supportedCapabilities.push(resolved);
    } else {
      missingCapabilities.push({ capabilityId: capId || 'unknown', tool: tool ?? null });
    }
  }

  const blockedPrerequisites = Array.isArray(intent.prerequisites)
    ? intent.prerequisites
        .filter((p) => p && typeof p === 'object' && p.satisfied === false)
        .map((p) => p.key)
        .filter(Boolean)
    : Array.isArray(plan.blockedBy)
      ? plan.blockedBy
      : [];

  let status = 'planned';
  if (planStatus === 'unsupported') {
    status = 'unsupported';
  } else if (
    planStatus === 'blocked' ||
    blockedPrerequisites.length > 0 ||
    missingCapabilities.length > 0
  ) {
    status = 'blocked';
  }

  const telemetryStatus =
    status === 'blocked' ? 'blocked' : status === 'unsupported' ? 'blocked' : 'completed';

  recordExecutionTelemetry({
    executionId,
    actionId: `runtime:dry_run:${plan.planId}`,
    source: 'performer_runtime_dry_run',
    status: telemetryStatus,
    missionId,
    intentId: String(intent.intentId),
    capabilityId: supportedCapabilities.map((c) => c.capabilityId).join(',') || null,
    downstreamOutcome: JSON.stringify({
      mode: 'dry_run',
      planId: plan.planId,
      planStatus,
      status,
      supportedCapabilities,
      missingCapabilities,
      blockedPrerequisites,
      timestamp,
    }),
    executionSource: 'performer_runtime_dry_run',
  });

  return {
    ok: true,
    executionId,
    status,
    plan,
    intentId: intent.intentId,
    planId: plan.planId,
    timestamp,
    supportedCapabilities,
    missingCapabilities,
    ...(blockedPrerequisites.length ? { blockedPrerequisites } : {}),
    telemetry: {
      mode: 'dry_run',
      executionId,
      missionId,
      intentId: intent.intentId,
      planId: plan.planId,
      status: telemetryStatus,
    },
  };
}
