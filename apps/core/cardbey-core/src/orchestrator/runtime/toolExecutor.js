/**
 * Tool Executor
 * Executes tools from the tools registry. When ctx.toolSteps is present, records each call for OrchestratorTask.result.toolSteps.
 */

import { getToolByName } from '../toolsRegistry.js';
import { logger } from '../../utils/logger.js';
import { PrismaClient } from '@prisma/client';
import { getEventEmitter } from '../../engines/loyalty/events.js';

const prisma = new PrismaClient();

const MAX_ARG_VALUE_LEN = 500;

/**
 * Sanitize args for logging: truncate long strings, cap object size.
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
function sanitizeArgs(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (v === undefined) continue;
    if (typeof v === 'string' && v.length > MAX_ARG_VALUE_LEN) {
      out[k] = v.slice(0, MAX_ARG_VALUE_LEN) + '…';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)) {
      try {
        const s = JSON.stringify(v);
        out[k] = s.length > MAX_ARG_VALUE_LEN ? s.slice(0, MAX_ARG_VALUE_LEN) + '…' : JSON.parse(s);
      } catch {
        out[k] = '[object]';
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Call a tool by name. If ctx.toolSteps is an array, appends a step (toolName, args, status, startedAt, finishedAt, errorMessage?).
 *
 * @param {string} toolName - Name of the tool to call (e.g., "loyalty.configure-program")
 * @param {Record<string, unknown>} input - Input parameters for the tool
 * @param {{ toolSteps?: Array<{ toolName: string; args: Record<string, unknown>; status: 'ok'|'error'; startedAt: string; finishedAt: string; errorMessage?: string }>; services?: object }} [ctx] - Execution context (optional). Pass toolSteps: [] to record steps for the run.
 * @returns {Promise<{ok: boolean, data?: unknown, error?: string}>} Tool execution result
 */
export async function callTool(toolName, input, ctx) {
  const startedAt = new Date().toISOString();
  const step = {
    toolName,
    args: sanitizeArgs(input || {}),
    status: 'ok',
    startedAt,
    finishedAt: startedAt,
  };
  if (Array.isArray(ctx?.toolSteps)) ctx.toolSteps.push(step);

  try {
    const tool = getToolByName(toolName);

    if (!tool) {
      logger.error('[ToolExecutor] Tool not found', { toolName });
      step.finishedAt = new Date().toISOString();
      step.status = 'error';
      step.errorMessage = `Tool "${toolName}" not found`;
      return { ok: false, error: step.errorMessage };
    }

    try {
      tool.inputSchema.parse(input);
    } catch (validationError) {
      const errorMessage = validationError instanceof Error
        ? validationError.message
        : String(validationError);
      logger.error('[ToolExecutor] Input validation failed', { toolName, error: errorMessage });
      step.finishedAt = new Date().toISOString();
      step.status = 'error';
      step.errorMessage = `Input validation failed: ${errorMessage}`;
      return { ok: false, error: errorMessage };
    }

    const engineContext = ctx?.services || {
      db: prisma,
      events: getEventEmitter(),
    };

    const result = await tool.handler(input, {
      services: engineContext,
      ...ctx,
    });

    try {
      tool.outputSchema.parse(result);
    } catch (validationError) {
      const errorMessage = validationError instanceof Error
        ? validationError.message
        : String(validationError);
      logger.warn('[ToolExecutor] Output validation failed', { toolName, error: errorMessage });
    }

    step.finishedAt = new Date().toISOString();
    step.status = result?.ok === false ? 'error' : 'ok';
    if (result?.ok === false && result?.error) step.errorMessage = result.error;
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[ToolExecutor] Tool execution error', { toolName, error: errorMessage });
    step.finishedAt = new Date().toISOString();
    step.status = 'error';
    step.errorMessage = errorMessage || 'Tool execution failed';
    return { ok: false, error: step.errorMessage };
  }
}

