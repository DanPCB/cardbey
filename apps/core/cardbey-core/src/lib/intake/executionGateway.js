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

import { getToolDefinition } from '../toolRegistry.js';

/**
 * Risk levels that block auto-apply — operator must confirm manually.
 */
const HIGH_RISK_PATCH_ACTIONS = new Set([
  'apply_patch',
  'apply_i18n_translations',
  'file_write',
  'restart_service',
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
 * Returns true if the current request is an operator session.
 * @param {GatewayContext} context
 */
function isOperatorSession(context) {
  return context?.operatorSession === true;
}

/**
 * Guard: block MAINTENANCE-only tools from running in business missions.
 * @param {string} toolName
 * @param {GatewayContext} context
 * @returns {{ blocked: boolean; reason?: string }}
 */
function checkToolAuthorization(toolName, context) {
  const toolDef = getToolDefinition(toolName);
  if (!toolDef) return { blocked: false };

  if (toolDef.requiresOperatorSession && !isOperatorSession(context)) {
    return {
      blocked: true,
      reason: `Tool "${toolName}" requires operator session.`,
    };
  }

  const allowedMissionTypes = Array.isArray(toolDef.missionTypes) ? toolDef.missionTypes : [];
  if (allowedMissionTypes.length > 0 && !allowedMissionTypes.includes(context?.missionType)) {
    return {
      blocked: true,
      reason: `Tool "${toolName}" is only available in ${allowedMissionTypes.join('/')} missions.`,
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

      if (!isOperatorSession(context)) {
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

      if (proposal?.status === 'failed') {
        return {
          action: 'chat',
          message:
            proposal?.error?.message ??
            'Audit succeeded but could not generate a patch proposal.',
        };
      }

      const proposalFile = proposal?.file ?? auditResult.file ?? '';
      const proposalPatch = proposal?.patch ?? '';

      return {
        action: 'approval_required',
        tool: 'apply_patch',
        parameters: {
          file: proposalFile,
          patch: proposalPatch,
        },
        confirmation: {
          message: proposal?.explanation ?? '',
          riskLevel: proposal?.riskLevel ?? 'medium',
          diff: proposalPatch,
          auditSource: auditResult.file ?? '',
        },
      };
    }

    // ── i18n sync (maintenance operator session) ─────────────────────────────
    case 'i18n_sync': {
      if (!isMaintenanceMission(context)) {
        return unsupportedResponse(
          'i18n_sync decisions require missionType: MAINTENANCE.',
          'i18n_sync',
        );
      }

      if (!isOperatorSession(context)) {
        return unsupportedResponse(
          'i18n_sync decisions require operator session.',
          'i18n_sync',
        );
      }

      const detectAuth = checkToolAuthorization('detect_i18n_gaps', context);
      if (detectAuth.blocked) {
        return unsupportedResponse(detectAuth.reason, 'detect_i18n_gaps');
      }

      const gaps = await dispatchTool('detect_i18n_gaps', {}, context);
      const count = Number(gaps?.count ?? 0);
      const fileCount = Number(gaps?.fileCount ?? 0);

      if (count === 0) {
        return {
          action: 'chat',
          message: '✅ All strings are translated. No gaps found.',
          data: { gaps },
        };
      }

      const mode = decision.mode === 'sync' ? 'sync' : 'check';

      if (mode === 'check') {
        return {
          action: 'chat',
          message: `Found ${count} untranslated strings across ${fileCount} files. Say "update translations" to generate Vietnamese entries.`,
          data: { gaps },
        };
      }

      const applyAuth = checkToolAuthorization('apply_i18n_translations', context);
      if (applyAuth.blocked) {
        return unsupportedResponse(applyAuth.reason, 'apply_i18n_translations');
      }

      const preview = await dispatchTool(
        'apply_i18n_translations',
        { gaps: gaps?.items ?? [], dryRun: true },
        context,
      );

      return {
        action: 'approval_required',
        tool: 'apply_i18n_translations',
        parameters: { gaps: gaps?.items ?? [] },
        confirmation: {
          message: `Found ${count} untranslated strings across ${fileCount} files. Claude has generated VI translations for review. Apply to i18n.js?`,
          riskLevel: 'low',
          diff: preview?.preview ?? preview?.log ?? '',
        },
      };
    }

    // ── Control Tower Query ───────────────────────────────────────────────────
    case 'control_tower_query': {
      const authCheck = checkToolAuthorization('query_control_tower', context);
      if (authCheck.blocked) {
        return unsupportedResponse(authCheck.reason, 'query_control_tower');
      }

      const summary = await dispatchTool('query_control_tower', {}, context);
      const actionableBlockers = Array.isArray(summary?.blockers)
        ? summary.blockers.filter((b) => b && typeof b === 'object' && b.actionable)
        : [];

      const tracedBlockers = await Promise.all(
        actionableBlockers.map(async (blocker) => {
          const audit = await dispatchTool(
            'audit_codebase',
            {
              errorMessage: blocker.description,
              stackTrace: '',
              context: blocker.source,
            },
            context
          ).catch(() => null);

          return {
            ...blocker,
            tracedFile: audit?.file ?? null,
            errorType: audit?.errorType ?? 'unknown',
            codeSnippet: audit?.codeSnippet ?? null,
          };
        }),
      );

      // Lazy import to keep gateway lightweight and avoid circulars.
      const { formatControlTowerSummary: fmt } = await import('./controlTowerQuery.js');

      return {
        action: 'chat',
        message: fmt(summary, tracedBlockers),
        data: {
          summary,
          tracedBlockers,
          suggestedNextFix: tracedBlockers.find((b) => b.tracedFile !== null) ?? null,
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