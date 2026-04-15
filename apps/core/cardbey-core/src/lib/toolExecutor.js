/**
 * Tool Executor - stub for mission pipeline step execution.
 * Validates tool exists in registry; does not implement real tool logic yet.
 */

import { getToolDefinition } from './toolRegistry.js';

export class ToolNotRegisteredError extends Error {
  constructor(toolName) {
    super(`Tool not registered: ${toolName}`);
    this.name = 'ToolNotRegisteredError';
    this.toolName = toolName;
  }
}

/**
 * Execute a tool by name (stub: always returns ok with empty output).
 * Throws ToolNotRegisteredError if toolName is not in the registry.
 *
 * @param {string} toolName
 * @param {object} [input]
 * @returns {Promise<{ status: 'ok', output: object }>}
 */
export async function executeTool(toolName, input = {}) {
  const def = getToolDefinition(toolName);
  if (!def) {
    throw new ToolNotRegisteredError(toolName);
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionSteps] executing tool: ${toolName}`);
  }
  return {
    status: 'ok',
    output: {},
  };
}
