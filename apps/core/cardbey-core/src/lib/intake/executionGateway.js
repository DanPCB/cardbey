/**
 * Execution Gateway — Phase 1.6 (MAINTENANCE mode + self-patch support).
 *
 * Converts a ReactPlannerDecision into executable system actions.
 *
 * Hard constraints:
 * - No imports from routes/
 * - No SSE wiring
 * - No state mutation / DB calls
 * - Must not bypass injected dispatchTool for execution
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Tools that are only available in MAINTENANCE mission context.
 * These will be rejected if missionType !== 'MAINTENANCE'.
 */
const MAINTENANCE_ONLY_TOOLS = new Set([
  'file_read',
  'file_write',
  'audit_codebase',
  'propose_patch',
  'apply_patch',
  'read_mission_log',
  'restart_service',
]);

/**
 * Tools that require operator role regardless of mission type.
 */
const OPERATOR_ONLY_TOOLS = new Set([
  'apply_patch',
  'restart_service',
]);

/**
 * Risk levels that block auto-apply — operator must confirm manually.
 */
const HIGH_RISK_PATCH_ACTIONS = new Set([
  'apply_patch',
]);

// ─── Typedefs ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   kind: 'ask';
 *   prompt: string;
 *   options?: unknown[];
 * }} AskDecision
 */

/**
 * @typedef {{
 *   kind: 'confirm';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 *   confirmation: Record<string, unknown>;
 * }} ConfirmDecision
 */

/**
 * @typedef {{
 *   kind: 'execute';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 * }} ExecuteDecision
 */

/**
 * @typedef {{
 *   kind: 'unsupported';
 *   reason?: string;
 * }} UnsupportedDecision
 */

/**
 * @typedef {{
 *   kind: 'self_patch';
 *   errorMessage: string;
 *   stackTrace?: string;
 *   context?: string;
 * }} SelfPatchDecision
 */

/**
 * @typedef {AskDecision | ConfirmDecision | ExecuteDecision | UnsupportedDecision | SelfPatchDecision} ReactPlannerDecision
 */

/**
 * @typedef {{
 *   missionType?: 'STORE_MANAGEMENT' | 'MARKETING' | 'PROMOTION' | 'MAINTENANCE' | string;
 *   userRole?: 'operator' | 'owner' | 'guest' | string;
 *   missionId?: string;
 *   storeId?: string;
 *   [key: string]: unknown;
 * }} GatewayContext
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the current context is a MAINTENANCE mission.
 * @param {GatewayContext} context
 */
function isMaintenanceMission(context) {
  return context?.missionType === 'MAINTENANCE';
}

/**
 * Returns true if the current user is an operator.
 * @param {GatewayContext} context
 */
function isOperator(context) {
  return context?.userRole === 'operator';
}

/**
 * Guard: block MAINTENANCE-only tools from running in business missions.
 * @param {string} toolName
 * @param {GatewayContext} context
 * @returns {{ blocked: boolean; reason?: string }}
 */
function checkToolAuthorization(toolName, context) {
  if (OPERATOR_ONLY_TOOLS.has(toolName) && !isOperator(context)) {
    return {
      blocked: true,
      reason: `Tool "${toolName}" requires operator role. Current role: ${context?.userRole ?? 'unknown'}.`,
    };
  }

  if (MAINTENANCE_ONLY_TOOLS.has(toolName) && !isMaintenanceMission(context)) {
    return {
      blocked: true,
      reason: `Tool "${toolName}" is only available in MAINTENANCE missions. Current mission type: ${context?.missionType ?? 'unset'}.`,
    };
  }

  return { blocked: false };
}

/**
 * Build a structured unsupported response with optional reason surfaced.
 * @param {string} [reason]
 * @param {string} [toolName]
 */
function unsupportedResponse(reason, toolName) {
  const isDevMode = process.env.NODE_ENV !== 'production';

  return {
    action: 'chat',
    message: isDevMode && reason
      ? `I'm not able to perform that action. Reason: ${reason}`
      : "I'm here to assist with business-related tasks such as store management, marketing, and promotions. If you have any questions or need help in those areas, feel free to ask!",
    ...(isDevMode && toolName ? { blockedTool: toolName } : {}),
  };
}

// ─── Main Gateway ─────────────────────────────────────────────────────────────

/**
 * @param {{
 *   decision: ReactPlannerDecision;
 *   context: GatewayContext;
 *   dispatchTool: (toolName: string, parameters: Record<string, unknown>, context: GatewayContext) => Promise<any>;
 * }} args
 */
export async function executionGateway({ decision, context, dispatchTool }) {
  switch (decision?.kind) {

    // ── Ask ───────────────────────────────────────────────────────────────────
    case 'ask':
      return {
        action: 'ask',
        prompt: decision.prompt,
        options: Array.isArray(decision.options) ? decision.options : [],
      };

    // ── Confirm ───────────────────────────────────────────────────────────────
    case 'confirm': {
      const { blocked, reason } = checkToolAuthorization(decision.toolName, context);
      if (blocked) return unsupportedResponse(reason, decision.toolName);

      return {
        action: 'approval_required',
        tool: decision.toolName,
        parameters: decision.parameters,
        confirmation: decision.confirmation,
      };
    }

    // ── Execute ───────────────────────────────────────────────────────────────
    case 'execute': {
      const { blocked, reason } = checkToolAuthorization(decision.toolName, context);
      if (blocked) return unsupportedResponse(reason, decision.toolName);

      // HIGH_RISK_PATCH_ACTIONS must never auto-execute — force confirm flow
      if (HIGH_RISK_PATCH_ACTIONS.has(decision.toolName)) {
        return {
          action: 'approval_required',
          tool: decision.toolName,
          parameters: decision.parameters,
          confirmation: {
            message: `"${decision.toolName}" is a high-risk operation and requires explicit operator approval before execution.`,
            riskLevel: 'high',
          },
        };
      }

      return await dispatchTool(decision.toolName, decision.parameters, context);
    }

    // ── Self Patch ────────────────────────────────────────────────────────────
    case 'self_patch': {
      if (!isMaintenanceMission(context)) {
        return unsupportedResponse(
          'self_patch decisions require missionType: MAINTENANCE.',
          'self_patch'
        );
      }

      if (!isOperator(context)) {
        return unsupportedResponse(
          'self_patch decisions require operator role.',
          'self_patch'
        );
      }

      // Step 1: audit to find the source file + line
      const auditResult = await dispatchTool(
        'audit_codebase',
        {
          errorMessage: decision.errorMessage,
          stackTrace: decision.stackTrace ?? '',
          context: decision.context ?? '',
        },
        context
      );

      if (!auditResult?.file) {
        return {
          action: 'chat',
          message: 'Audit complete but could not trace the error to a specific file. Manual investigation required.',
          auditResult,
        };
      }

      // Step 2: propose a patch — always surfaces as approval_required
      const proposal = await dispatchTool(
        'propose_patch',
        {
          file: auditResult.file,
          lineRange: auditResult.lineRange,
          errorType: auditResult.errorType,
          codeSnippet: auditResult.codeSnippet,
        },
        context
      );

      return {
        action: 'approval_required',
        tool: 'apply_patch',
        parameters: {
          file: proposal.file,
          patch: proposal.patch,
        },
        confirmation: {
          message: proposal.explanation,
          riskLevel: proposal.riskLevel ?? 'medium',
          diff: proposal.patch,
          auditSource: auditResult.file,
        },
      };
    }

    // ── Unsupported ───────────────────────────────────────────────────────────
    case 'unsupported':
      return unsupportedResponse(decision.reason);

    // ── Unknown / fallback ────────────────────────────────────────────────────
    default:
      return unsupportedResponse(
        `Unknown decision kind: "${decision?.kind}"`
      );
  }
}