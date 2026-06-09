/**
 * Tool Executor - legacy entry; delegates to toolDispatcher for real executor routing.
 */

import { getToolDefinition } from './toolRegistry.js';
import { dispatchTool } from './toolDispatcher.js';

export class ToolNotRegisteredError extends Error {
  constructor(toolName) {
    super(`Tool not registered: ${toolName}`);
    this.name = 'ToolNotRegisteredError';
    this.toolName = toolName;
  }
}

/**
 * Execute a tool by name via toolDispatcher (registered executors).
 * Throws ToolNotRegisteredError if toolName is not in the registry.
 *
 * @param {string} toolName
 * @param {object} [input]
 * @param {object} [context]
 * @returns {Promise<import('./toolDispatcher.js').DispatchResult>}
 */
export async function executeTool(toolName, input = {}, context = {}) {
  const def = getToolDefinition(toolName);
  if (!def) {
    throw new ToolNotRegisteredError(toolName);
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionSteps] executing tool: ${toolName}`);
  }
  return await dispatchTool(toolName, input, context);
}
