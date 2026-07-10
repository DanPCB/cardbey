/**
 * Execution Context Kernel — single pre-compile gateway for store-scoped missions.
 *
 * Intent → resolveStoreForIntakeTool → Compiler → Topology
 *
 * All requiresStore tools must resolve through this helper (not ad-hoc ambiguity).
 */

import {
  resolveExecutionContext,
  buildExecutionContextClarifyPayload,
  buildResolvedExecutionContext,
} from './resolveExecutionContext.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * True when the owner explicitly chose or confirmed a store (picker / Yes / named in prompt).
 * @param {Record<string, unknown>} params
 */
export function hasExplicitOwnerStoreSelection(params = {}) {
  const selectionMethod = pickString(params.selectionMethod);
  return (
    params.confirmedActiveSpace === true ||
    selectionMethod === 'manual' ||
    selectionMethod === 'active-space' ||
    selectionMethod === 'explicit_prompt'
  );
}

/**
 * Session hints only unless the owner explicitly selected / confirmed a store.
 * @param {Record<string, unknown>} params
 * @param {string | null | undefined} sessionHint
 */
export function pickStoreHintForIntakeTool(params = {}, sessionHint = null) {
  if (hasExplicitOwnerStoreSelection(params)) {
    return pickString(params.storeId, params.activeStoreId, sessionHint);
  }
  return pickString(sessionHint);
}

/**
 * Mission-facing question for store clarify (tool-aware).
 * @param {string} tool
 */
export function executionContextQuestionForTool(tool) {
  const t = String(tool ?? '').trim();
  if (t === 'setup_loyalty_program' || t === 'create_loyalty_program') {
    return 'Which business should I create this loyalty program for?';
  }
  if (t === 'create_campaign' || t === 'launch_campaign') {
    return 'Which business should I create this campaign for?';
  }
  if (t === 'create_promotion' || t === 'activate_promotion') {
    return 'Which business should I create this offer for?';
  }
  return 'Which business should I apply this to?';
}

/**
 * Confirm-active-space question.
 * @param {string} storeName
 * @param {string} tool
 */
export function executionContextConfirmQuestion(storeName, tool) {
  const name = pickString(storeName) || 'this business';
  const t = String(tool ?? '').trim();
  if (t === 'setup_loyalty_program' || t === 'create_loyalty_program') {
    return `Create this loyalty program for ${name}?`;
  }
  if (t === 'create_campaign' || t === 'launch_campaign') {
    return `Create this campaign for ${name}?`;
  }
  return `Continue with ${name}?`;
}

/**
 * Hydrate candidate store ids from intake body / session / runway (priority order).
 * @param {Record<string, unknown>} opts
 * @returns {string | null}
 */
export function hydrateStoreHint(opts = {}) {
  const {
    body = {},
    currentContext = {},
    runway = null,
    session = null,
    selectionStoreId = null,
    performeeStoreId = null,
    dispatchStoreId = null,
    effectiveStoreId = null,
    storeId = null,
  } = opts;
  const sessionStore =
    (session && typeof session === 'object'
      ? session.activeStoreId ?? session.storeId
      : null) ?? null;
  const runwayStore =
    (runway && typeof runway === 'object' ? runway.activeStoreId ?? runway.storeId : null) ?? null;
  const candidates = [
    body?.storeId,
    body?.activeStoreId,
    body?.currentContext?.storeId,
    body?.currentContext?.activeStoreId,
    currentContext?.storeId,
    currentContext?.activeStoreId,
    runwayStore,
    sessionStore,
    selectionStoreId,
    performeeStoreId,
    dispatchStoreId,
    effectiveStoreId,
    storeId,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Universal store resolution for any requiresStore intake tool.
 *
 * Explicit lock only when:
 * - params.storeId is set (chip/picker selection or explicit param), OR
 * - confirmedActiveSpace / selectionMethod is set with a store id
 *
 * Session/runway activeStoreId alone is a HINT → confirm when multi-store.
 *
 * @param {{
 *   userId?: string | null;
 *   tool?: string | null;
 *   userMessage?: string | null;
 *   classification?: { parameters?: Record<string, unknown>; tool?: string } | null;
 *   hintedStoreId?: string | null;
 *   paramsStoreId?: string | null;
 *   lockedParams?: Record<string, unknown>;
 * }} args
 */
export async function resolveStoreForIntakeTool(args = {}) {
  const classification = args.classification && typeof args.classification === 'object'
    ? args.classification
    : {};
  const params =
    classification.parameters &&
    typeof classification.parameters === 'object' &&
    !Array.isArray(classification.parameters)
      ? classification.parameters
      : args.lockedParams && typeof args.lockedParams === 'object'
        ? args.lockedParams
        : {};

  const tool = pickString(args.tool, classification.tool) || 'general_chat';
  const selectionMethod = pickString(params.selectionMethod, args.selectionMethod);
  const confirmedActiveSpace =
    params.confirmedActiveSpace === true || args.confirmedActiveSpace === true;

  // Intent reasoner often injects parameters.storeId from currentContext.activeStoreId.
  // That is a SESSION HINT, not an explicit owner choice — never silent-lock multi-store on it.
  const hasExplicitOwnerSelection =
    confirmedActiveSpace || hasExplicitOwnerStoreSelection(params);

  const sessionHint = pickString(args.hintedStoreId, params.activeStoreId);
  const rawParamsStoreId = pickString(args.paramsStoreId, params.storeId);

  // Explicit lock only after Yes / picker / confirmed handoff.
  const paramsStoreId = hasExplicitOwnerSelection
    ? pickString(rawParamsStoreId, sessionHint)
    : null;

  // Session / auto-injected storeId becomes the active-space hint for confirm UI.
  const hintedStoreId = paramsStoreId
    ? null
    : pickString(sessionHint, rawParamsStoreId);

  const resolution = await resolveExecutionContext({
    userId: args.userId,
    hintedStoreId,
    paramsStoreId,
    confirmedActiveSpace,
    selectionMethod,
    intentText: pickString(args.userMessage, params.goal, params.hint, params.campaignContext),
    userMessage: args.userMessage,
    lockedTool: tool,
    lockedParams: params,
  });

  if (resolution.resolved && resolution.executionContext) {
    return {
      resolved: true,
      kind: resolution.kind ?? 'resolved',
      storeId: resolution.executionContext.storeId ?? null,
      executionContext: resolution.executionContext,
      clarify: null,
    };
  }

  // Retarget clarify copy for non-loyalty tools (resolver defaults to loyalty wording).
  let clarify = resolution.clarify && typeof resolution.clarify === 'object'
    ? { ...resolution.clarify }
    : null;
  if (clarify) {
    const activeName = clarify.activeStoreCandidate?.name;
    if (clarify.clarifyType === 'active_space_confirm' && activeName) {
      const q = executionContextConfirmQuestion(activeName, tool);
      clarify.response = q;
      clarify.message = q;
    } else if (clarify.clarifyType === 'execution_context_store_picker') {
      const q = executionContextQuestionForTool(tool);
      clarify.response = q;
      clarify.message = q;
    }
    clarify.action = 'clarify_store';
    clarify.lockedTool = tool;
  }

  return {
    resolved: false,
    kind: resolution.kind ?? 'store_required',
    storeId: null,
    executionContext: null,
    clarify,
  };
}

export {
  resolveExecutionContext,
  buildExecutionContextClarifyPayload,
  buildResolvedExecutionContext,
};
