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

import { getToolDefinition } from './toolRegistry.js';
import { getExecutor } from './toolExecutors/index.js';

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
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[ToolDispatcher] dispatching tool: ${name || '(empty)'}`);
  }

  if (!name) {
    return {
      status: 'failed',
      error: { code: 'INVALID_TOOL_NAME', message: 'toolName is required' },
    };
  }
  /** GIF slideshow is built in the dashboard and uploaded via /api/media/upload. */
  if (name === 'generate_slideshow') {
    return {
      status: 'ok',
      output: { slideshowUrl: null, status: 'pending_client_export' },
    };
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

  try {
    const result = await executor.execute(input, context);
    const status = result?.status === 'blocked' ? 'blocked' : result?.status === 'failed' ? 'failed' : 'ok';
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
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ToolDispatcher] completed tool: ${name} status=failed (exception)`);
    }
    return {
      status: 'failed',
      error: { code: 'EXECUTION_ERROR', message },
    };
  }
}
