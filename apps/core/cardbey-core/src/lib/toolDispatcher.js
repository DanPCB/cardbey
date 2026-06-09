/**
 * Tool Execution Dispatcher - validates tool, resolves executor, runs it, returns normalized result.
 * Used by Mission Pipeline step runner. Missing executor does not crash; returns controlled failure.
 *
 * MCP: Any future MCP-backed capability must be reached through registered tool executors invoked
 * from this dispatcher (or equivalent runtime dispatch), with context from Mission Execution —
 * not from UI-direct MCP clients acting as orchestrators.
 *
 * Convergence: prefer `executeMissionAction` from `lib/execution/executeMissionAction.js` for new
 * runtime-owned call sites (`dispatch_tool` routes here). This dispatcher remains the tool implementation seam.
 */

import { buildExecutionFrame } from './executionFrame.js';
import { getToolDefinition } from './toolRegistry.js';
import { getExecutor } from './toolExecutors/index.js';
import {
  actionIdForTool,
  withExecutionTelemetry,
} from './broker/executionTelemetry.js';
import {
  detectExecutionDuplication,
  incrementRuntimeAuthorityMetric,
} from './runtime/performerRuntime/runtimeAuthorityStaging.js';
import { writeEpisodicEventAsync } from './memory/episodicWriter.js';
import { enrichMediaSearchInput } from '../services/media/mediaQueryEnrichment.js';

/**
 * @typedef {import('./toolRegistry.js').ToolDefinition} ToolDefinition
 */

/**
 * Normalized dispatch result.
 * @typedef {{
 *   status: 'ok' | 'failed' | 'blocked';
 *   output?: object;
 *   blocker?: { code: string, message: string, requiredAction?: string };
 *   error?: { code: string, message: string };
 * }} DispatchResult
 */

export { buildExecutionFrame } from './executionFrame.js';

/**
 * Dispatch a tool by name. Validates tool exists in registry, runs executor if present, returns normalized result.
 * Does not throw for missing executor or tool; returns status 'failed' with error.
 *
 * @param {string} toolName
 * @param {object} [input]
 * @param {object} [context]
 * @returns {Promise<DispatchResult>}
 */
export async function dispatchTool(toolName, input = {}, context = undefined) {
  const name = typeof toolName === 'string' ? toolName.trim() : '';
  const baseCtx =
    context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const frame = await buildExecutionFrame(baseCtx);
  const ctx = { ...baseCtx, locale: frame.locale, executionFrame: frame };

  const ownership = await import('./runtime/performerRuntime/runtimeOwnership.js');
  const ownershipCheck = ownership.assertRuntimeOwnership(ctx, ctx.source ?? 'tool_dispatcher');
  if (ownershipCheck.violation) {
    // Metrics semantics:
    // - orphanWarnings: warn-only orphan executions (allowed to proceed)
    // - ownershipBlocks: blocked orphan executions (Stage E)
    if (ownershipCheck.allowed) incrementRuntimeAuthorityMetric('orphanWarnings');
    else incrementRuntimeAuthorityMetric('ownershipBlocks');
  }
  if (!ownershipCheck.allowed) {
    return {
      status: 'blocked',
      blocker: {
        code: ownershipCheck.code,
        message: ownershipCheck.message,
      },
    };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[ToolDispatcher] dispatching tool: ${name || '(empty)'}`);
  }

  if (name === 'create_store') {
    console.log('[create_store] dispatchTool payload:', JSON.stringify(input ?? {}));
  }

  if (!name) {
    return {
      status: 'failed',
      error: { code: 'INVALID_TOOL_NAME', message: 'toolName is required' },
    };
  }

  if (name === 'device.sendInput') {
    const params = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    let task = String(params.task ?? params.description ?? params.goal ?? '').trim();
    // Strip Performer trigger phrases — SuperCopilot only needs the action.
    task = task
      .replace(/^use (the |control )?device (to )?/i, '')
      .replace(/^control device (to )?/i, '')
      .trim();
    const deviceId = params.deviceId != null ? String(params.deviceId).trim() : undefined;
    console.log('[device.sendInput] dispatch attempt', {
      task,
      deviceId,
      hasTask: Boolean(task),
    });
    console.log('[device.sendInput] cleaned task:', task);
    if (!task) {
      return {
        status: 'failed',
        error: { code: 'INVALID_INPUT', message: 'task parameter is required' },
      };
    }
    input = { ...params, task, description: task, goal: task };
  }

  // Proactive-only tools are handled by performerProactiveStepRoutes, not toolDispatcher.
// Return a passthrough signal so the caller can proceed with mission creation.
const PROACTIVE_ONLY_TOOLS = new Set(['code_fix']);
if (PROACTIVE_ONLY_TOOLS.has(name)) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[ToolDispatcher] proactive-only tool, skipping dispatch: ${name}`);
  }
  return {
    status: 'ok',
    proactiveOnly: true,
    output: { tool: name, message: 'Handled by proactive step routes' },
  };
}

  const def = getToolDefinition(name);
  if (!def) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ToolDispatcher] tool not in registry: ${name}`);
    }
    return {
      status: 'failed',
      error: { code: 'TOOL_NOT_REGISTERED', message: `Tool not registered: ${name}` },
    };
  }

  const executor = getExecutor(name);
  if (!executor || typeof executor.execute !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ToolDispatcher] missing executor for tool: ${name}`);
    }
    return {
      status: 'failed',
      error: {
        code: 'TOOL_EXECUTOR_NOT_FOUND',
        message: `No executor registered for tool: ${name}`,
      },
    };
  }

  const missionId =
    (typeof ctx.missionId === 'string' && ctx.missionId.trim()) ||
    (typeof ctx.activeMissionId === 'string' && ctx.activeMissionId.trim()) ||
    null;
  const episodicUserId =
    (typeof ctx.userId === 'string' && ctx.userId.trim()) ||
    (typeof ctx.actorId === 'string' && ctx.actorId.trim()) ||
    (typeof ctx.executionFrame?.userId === 'string' && ctx.executionFrame.userId.trim()) ||
    null;
  const resolvedStoreId =
    (typeof ctx.storeId === 'string' && ctx.storeId.trim()) ||
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    null;
  const intentId = typeof ctx.intentId === 'string' && ctx.intentId.trim() ? ctx.intentId.trim() : null;
  const telemetrySource =
    typeof ctx.source === 'string' && ctx.source.trim() ? ctx.source.trim() : 'tool_dispatcher';

  const skipNestedTelemetry = ctx.skipNestedBrokerTelemetry === true;
  // If we are nested under Performer Runtime (skipNestedBrokerTelemetry), runtime already performs
  // duplication detection at the runtime facade boundary.
  if (!skipNestedTelemetry) {
    detectExecutionDuplication({
      missionId,
      toolName: name,
      actionId: actionIdForTool(name),
      source: telemetrySource,
    });
  }

  try {
    const enrichedInput = await enrichMediaSearchInput(name, input, ctx);
    const runExecutor = () => executor.execute(enrichedInput, ctx);
    let result;
    if (skipNestedTelemetry) {
      incrementRuntimeAuthorityMetric('telemetrySkippedNested');
      const raw = await runExecutor();
      const innerStatus =
        raw?.status === 'blocked' ? 'blocked' : raw?.status === 'failed' ? 'failed' : 'ok';
      result = {
        status: innerStatus,
        ...(raw?.output != null && { output: raw.output }),
        ...(raw?.blocker != null && { blocker: raw.blocker }),
        ...(raw?.error != null && { error: raw.error }),
      };
    } else {
      result = await withExecutionTelemetry({
        actionId: actionIdForTool(name),
        toolName: name,
        source: telemetrySource,
        missionId,
        intentId,
        run: runExecutor,
        mapResult: (r) => {
          const status =
            r?.status === 'blocked' ? 'blocked' : r?.status === 'failed' ? 'failed' : 'completed';
          return {
            status,
            failureCode: r?.error?.code ?? r?.blocker?.code ?? null,
          };
        },
      });
      incrementRuntimeAuthorityMetric('telemetryEmitted');
    }
    const status = result?.status === 'blocked' ? 'blocked' : result?.status === 'failed' ? 'failed' : 'ok';
    if (episodicUserId) {
      const outStoreId =
        (result?.output && typeof result.output === 'object' && result.output.storeId) ||
        resolvedStoreId;
      writeEpisodicEventAsync({
        userId: episodicUserId,
        missionId,
        type: 'execution_outcome',
        toolName: name,
        storeId: typeof outStoreId === 'string' ? outStoreId : null,
        result: status === 'ok' ? 'success' : 'error',
        errorMsg: status === 'ok' ? null : result?.error?.message ?? result?.blocker?.message ?? null,
      });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ToolDispatcher] completed tool: ${name} status=${status}`);
    }
    return {
      status,
      ...(result?.output != null && { output: result.output }),
      ...(result?.blocker != null && { blocker: result.blocker }),
      ...(result?.error != null && { error: result.error }),
    };
  } catch (err) {
    const message = err?.message || String(err);
    if (episodicUserId) {
      writeEpisodicEventAsync({
        userId: episodicUserId,
        missionId,
        type: 'execution_outcome',
        toolName: name,
        storeId: resolvedStoreId,
        result: 'error',
        errorMsg: message,
      });
    }
    if (name === 'create_store') {
      console.error('[create_store] FAILED:', message, err?.stack);
      throw err;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ToolDispatcher] completed tool: ${name} status=failed (exception)`);
    }
    return {
      status: 'failed',
      error: { code: 'EXECUTION_ERROR', message },
    };
  }
}
