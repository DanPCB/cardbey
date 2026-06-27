/**
 * Kernel-authorized tool dispatch for Intake V2 (replaces legacy direct_action bypass).
 */

import { unifiedDispatch } from './unifiedDispatch.js';
import { isKernelOnlyIntakeTool, getKernelOnlyIntakeToolMessage } from './intakeShortcutPolicy.js';

/**
 * Execute a classified or shortcut tool through unifiedDispatch → executeRuntimeAction.
 *
 * @param {string} toolName
 * @param {object} cleanedParams
 * @param {{
 *   missionId?: string|null,
 *   storeId?: string|null,
 *   userId?: string|null,
 *   tenantId?: string|null,
 *   locale?: string,
 *   source?: string,
 *   confirmed?: boolean,
 *   context?: object,
 * }} ctx
 * @returns {Promise<{ toolResult: object, payload: object, dispatchResult?: object }>}
 */
export async function dispatchIntakeToolViaUnifiedKernel(toolName, cleanedParams, ctx = {}) {
  const tool = String(toolName ?? '').trim();
  const payload = cleanedParams && typeof cleanedParams === 'object' && !Array.isArray(cleanedParams)
    ? { ...cleanedParams }
    : {};

  if (!tool) {
    return {
      toolResult: {
        status: 'failed',
        error: { code: 'TOOL_REQUIRED', message: 'Tool name is required.' },
      },
      payload,
    };
  }

  if (isKernelOnlyIntakeTool(tool)) {
    return {
      toolResult: {
        status: 'blocked',
        blocker: {
          code: 'KERNEL_EXECUTION_REQUIRED',
          message: getKernelOnlyIntakeToolMessage(tool),
        },
      },
      payload,
    };
  }

  const missionId =
    (typeof ctx.missionId === 'string' && ctx.missionId.trim()) ||
    (typeof payload.missionId === 'string' && payload.missionId.trim()) ||
    null;
  if (missionId) payload.missionId = missionId;
  if (ctx.storeId && !payload.storeId) payload.storeId = ctx.storeId;

  const dispatchPayload = {
    toolName: tool,
    input: payload,
    parameters: payload,
    missionId,
    storeId: ctx.storeId ?? payload.storeId ?? undefined,
    userId: ctx.userId ?? null,
    tenantId: ctx.tenantId ?? null,
    locale: ctx.locale ?? 'en',
    ...(ctx.context && typeof ctx.context === 'object' ? { context: ctx.context } : {}),
  };

  const result = await unifiedDispatch(
    { type: tool, payload: dispatchPayload },
    {
      source: ctx.source ?? 'intake_v2_unified',
      requireConfirmation: false,
      confirmed: ctx.confirmed !== false,
    },
  );

  if (!result.ok || result.status === 'blocked') {
    return {
      toolResult: {
        status: 'blocked',
        blocker: {
          code: result.code ?? 'KERNEL_EXECUTION_REQUIRED',
          message:
            result.message ??
            'Direct tool execution is disabled. Execution must go through mission planning and the Runtime Kernel.',
        },
      },
      payload: result.payload ?? payload,
      dispatchResult: result,
    };
  }

  const toolResult =
    result.toolResult ??
    ({
      status: result.ok ? 'ok' : 'failed',
      output: result.output ?? result,
    });

  return {
    toolResult,
    payload: result.payload ?? payload,
    dispatchResult: result,
  };
}
