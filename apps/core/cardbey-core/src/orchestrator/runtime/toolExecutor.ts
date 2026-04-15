/**
 * Tool Executor
 * Executes tools from the tools registry
 */

import { getToolByName } from '../toolsRegistry.js';
import { logger } from '../../utils/logger.js';
import { PrismaClient } from '@prisma/client';
import { getEventEmitter } from '../../engines/loyalty/events.js';
import type { OrchestratorToolStep } from './orchestratorToolStep.js';

const prisma = new PrismaClient();

export type { OrchestratorToolStep };

/**
 * Context interface for tool execution.
 * When toolSteps is present, each callTool records a step for the run.
 */
export interface ToolContext {
  services?: {
    db?: PrismaClient;
    events?: ReturnType<typeof getEventEmitter>;
    [key: string]: unknown;
  };
  /** When set, each callTool appends a step (for persistence in OrchestratorTask.result.toolSteps) */
  toolSteps?: OrchestratorToolStep[];
  [key: string]: unknown;
}

/**
 * Call a tool by name
 * 
 * @param toolName - Name of the tool to call (e.g., "loyalty.configure-program")
 * @param input - Input parameters for the tool
 * @param ctx - Execution context (optional)
 * @returns Tool execution result
 */
const MAX_ARG_VALUE_LEN = 500;

function sanitizeArgs(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
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

export async function callTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx?: ToolContext
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const startedAt = new Date().toISOString();
  const step: OrchestratorToolStep = {
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
    } catch (validationError: unknown) {
      const errorMessage = validationError instanceof Error
        ? validationError.message
        : String(validationError);
      logger.error('[ToolExecutor] Input validation failed', { toolName, error: errorMessage });
      step.finishedAt = new Date().toISOString();
      step.status = 'error';
      step.errorMessage = `Input validation failed: ${errorMessage}`;
      return { ok: false, error: step.errorMessage };
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
    } catch (validationError: unknown) {
      const errorMessage = validationError instanceof Error
        ? validationError.message
        : String(validationError);
      logger.warn('[ToolExecutor] Output validation failed', { toolName, error: errorMessage });
    }

    step.finishedAt = new Date().toISOString();
    step.status = result?.ok === false ? 'error' : 'ok';
    if (result?.ok === false && result?.error) step.errorMessage = result.error;
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[ToolExecutor] Tool execution error', { toolName, error: errorMessage });
    step.finishedAt = new Date().toISOString();
    step.status = 'error';
    step.errorMessage = errorMessage || 'Tool execution failed';
    return { ok: false, error: step.errorMessage };
  }
}

