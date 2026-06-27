/**
 * Runtime authority checks — every mode must pass before execution.
 */

import { assertKernelAuthorizedExecution } from '../runtime/kernelMandatory.js';
import { getToolEntry } from '../intake/intakeToolRegistry.js';

/** Tools allowed for guest manual actions. */
const GUEST_MANUAL_TOOLS = new Set([
  'create_store',
  'upload_store_asset',
  'create_promotion_graphic',
  'general_chat',
  'ingest_asset_for_intent_detection',
]);

/** Tools blocked for guests regardless of mode. */
const GUEST_BLOCKED_TOOLS = new Set(['publish_store', 'delete_store']);

/** Explicit manual-mode action keys → intake tools. */
export const MANUAL_ACTION_TOOL_MAP = {
  create_store: { tool: 'create_store', executionPath: 'proactive_plan', confidence: 0.95 },
  add_product: { tool: 'replace_store_catalog', executionPath: 'proactive_plan', confidence: 0.92 },
  create_campaign: { tool: 'create_campaign', executionPath: 'proactive_plan', confidence: 0.88 },
  launch_campaign: { tool: 'create_campaign', executionPath: 'proactive_plan', confidence: 0.88 },
  generate_graphic: { tool: 'create_promotion_graphic', executionPath: 'proactive_plan', confidence: 0.9 },
  create_promotion_graphic: {
    tool: 'create_promotion_graphic',
    executionPath: 'proactive_plan',
    confidence: 0.9,
  },
  publish_store: { tool: 'publish_store', executionPath: 'proactive_plan', confidence: 0.85 },
  setup_loyalty: { tool: 'setup_loyalty_program', executionPath: 'proactive_plan', confidence: 0.9 },
  setup_loyalty_program: {
    tool: 'setup_loyalty_program',
    executionPath: 'proactive_plan',
    confidence: 0.9,
  },
  upload_asset: { tool: 'upload_store_asset', executionPath: 'proactive_plan', confidence: 0.85 },
  view_analytics: { tool: 'get_store_analytics', executionPath: 'direct_action', confidence: 0.85 },
  ingest_document: { tool: 'ingest_document', executionPath: 'direct_action', confidence: 0.9 },
  create_offer: { tool: 'create_offer', executionPath: 'proactive_plan', confidence: 0.85 },
};

/**
 * @param {object} input
 * @param {{ tool: string, parameters?: Record<string, unknown> }} input.action
 * @param {string | null | undefined} input.userId
 * @param {boolean} [input.isGuest]
 * @param {{ activeStoreId?: string | null, activeDraftId?: string | null }} [input.context]
 * @param {'manual' | 'automation'} [input.mode]
 * @param {string} [input.source]
 * @returns {Promise<{ allowed: boolean, checks: Array<Record<string, unknown>>, reason: string | null }>}
 */
export async function checkRuntimeAuthority(input = {}) {
  const action = input.action ?? {};
  const tool = String(action.tool ?? '').trim();
  const parameters =
    action.parameters && typeof action.parameters === 'object' && !Array.isArray(action.parameters)
      ? action.parameters
      : {};
  const isGuest = Boolean(input.isGuest);
  const checks = [];

  if (!tool) {
    return {
      allowed: false,
      checks: [{ check: 'tool', passed: false, reason: 'No tool specified' }],
      reason: 'No tool specified',
    };
  }

  const entry = getToolEntry(tool);
  if (!entry) {
    checks.push({ check: 'registry', passed: false, reason: `Unknown tool: ${tool}` });
  }

  if (isGuest && GUEST_BLOCKED_TOOLS.has(tool)) {
    checks.push({
      check: 'guest_permission',
      passed: false,
      reason: `Guest cannot run ${tool}`,
    });
  }

  if (input.mode === 'manual' && isGuest && !GUEST_MANUAL_TOOLS.has(tool)) {
    checks.push({
      check: 'manual_guest_allowlist',
      passed: false,
      reason: `Tool ${tool} is not allowed for guest manual mode`,
    });
  }

  const needsStore =
    entry?.requiresStore === true ||
    ['replace_store_catalog', 'publish_store', 'get_store_analytics', 'setup_loyalty_program'].includes(
      tool,
    );
  const storeId = String(parameters.storeId ?? input.context?.activeStoreId ?? '').trim();
  if (needsStore && !storeId && !input.context?.activeDraftId) {
    checks.push({
      check: 'store_context',
      passed: false,
      reason: 'This action requires an active store',
    });
  }

  const kernelSource = input.mode === 'manual' ? 'intake_v2_manual_mode' : 'intake_v2_unified';
  const kernelAuth = assertKernelAuthorizedExecution({
    source: kernelSource,
    userId: input.userId ?? null,
  });
  if (!kernelAuth.ok) {
    checks.push({
      check: 'kernel_authority',
      passed: false,
      reason: kernelAuth.message ?? kernelAuth.code ?? 'kernel_required',
    });
  }

  const failed = checks.filter((c) => c.passed === false);
  return {
    allowed: failed.length === 0,
    checks,
    reason: failed.length ? failed.map((c) => c.reason).filter(Boolean).join('; ') : null,
  };
}

/**
 * @param {string} actionKey
 * @returns {{ tool: string, executionPath: string, confidence: number } | null}
 */
export function resolveManualActionTool(actionKey) {
  const key = String(actionKey ?? '').trim();
  if (!key) return null;
  return MANUAL_ACTION_TOOL_MAP[key] ?? MANUAL_ACTION_TOOL_MAP[key.replace(/-/g, '_')] ?? null;
}
