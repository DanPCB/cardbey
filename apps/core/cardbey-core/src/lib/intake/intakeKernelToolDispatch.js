/**
 * Kernel-authorized tool dispatch for Intake V2 (replaces legacy direct_action bypass).
 */

import { unifiedDispatch } from './unifiedDispatch.js';
import { isKernelOnlyIntakeTool, getKernelOnlyIntakeToolMessage, KERNEL_ONLY_INTAKE_TOOLS } from './intakeShortcutPolicy.js';
import { diagLog, isKernelDispatchDiagEnabled } from '../diagnostics/storeCreationDiagnostics.js';

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
  const diag = isKernelDispatchDiagEnabled();
  const tool = String(toolName ?? '').trim();
  const payload = cleanedParams && typeof cleanedParams === 'object' && !Array.isArray(cleanedParams)
    ? { ...cleanedParams }
    : {};

  diagLog(diag, '===== Kernel Tool Dispatch =====');
  diagLog(diag, 'Tool name:', tool);
  diagLog(diag, 'Parameters:', payload);
  diagLog(diag, 'Context:', {
    source: ctx.source ?? null,
    missionId: ctx.missionId ?? null,
    storeId: ctx.storeId ?? null,
    userId: ctx.userId ?? null,
    activeStoreId: ctx.context?.activeStoreId ?? null,
  });
  diagLog(diag, 'viaKernel: true (dispatchIntakeToolViaUnifiedKernel)');
  const isKernelOnly = isKernelOnlyIntakeTool(tool);
  diagLog(diag, 'Is kernel-only?', isKernelOnly);
  diagLog(diag, 'Kernel-only tools:', [...KERNEL_ONLY_INTAKE_TOOLS]);
  diagLog(diag, 'BYPASS_KERNEL_FOR_CREATE_STORE:', process.env.BYPASS_KERNEL_FOR_CREATE_STORE);
  diagLog(diag, 'EMERGENCY_BYPASS_KERNEL:', process.env.EMERGENCY_BYPASS_KERNEL);

  if (!tool) {
    return {
      toolResult: {
        status: 'failed',
        error: { code: 'TOOL_REQUIRED', message: 'Tool name is required.' },
      },
      payload,
    };
  }

  if (tool === 'create_campaign' && ctx.confirmed !== false) {
    const { UNIFIED_ACTION_TYPES } = await import('../execution/executionTypes.js');
    const result = await unifiedDispatch(
      {
        type: UNIFIED_ACTION_TYPES.CREATE_CAMPAIGN_CHECKPOINT,
        payload: {
          toolName: tool,
          input: payload,
          parameters: payload,
          userId: ctx.userId ?? null,
          actorId: ctx.userId ?? null,
          tenantId: ctx.tenantId ?? null,
          storeId: ctx.storeId ?? payload.storeId ?? null,
          missionId: ctx.missionId ?? payload.missionId ?? null,
          locale: ctx.locale ?? 'en',
          userMessage: String(payload.campaignContext ?? payload.hint ?? '').trim(),
          classification: { tool: 'create_campaign', parameters: { ...payload, confirmed: true, _autoSubmit: true } },
        },
      },
      {
        source: ctx.source ?? 'intake_v2_unified',
        requireConfirmation: false,
        confirmed: true,
      },
    );
    if (!result.ok || result.status === 'blocked') {
      return {
        toolResult: {
          status: 'blocked',
          blocker: {
            code: result.code ?? 'KERNEL_EXECUTION_REQUIRED',
            message: result.message ?? getKernelOnlyIntakeToolMessage(tool),
          },
        },
        payload: result.payload ?? payload,
        dispatchResult: result,
      };
    }
    return {
      toolResult: {
        status: 'ok',
        output: result.responseBody ?? result,
      },
      payload: result.payload ?? payload,
      dispatchResult: result,
    };
  }

  if (isKernelOnlyIntakeTool(tool)) {
    diagLog(diag, '❌ BLOCKED: KERNEL_EXECUTION_REQUIRED (kernel-only tool — use checkpoint dispatch)');
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
    diagLog(diag, '❌ unifiedDispatch blocked/failed:', {
      ok: result.ok,
      status: result.status,
      code: result.code ?? null,
      message: result.message ?? null,
    });
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

  diagLog(diag, '✅ Tool dispatch allowed via unifiedDispatch');
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
