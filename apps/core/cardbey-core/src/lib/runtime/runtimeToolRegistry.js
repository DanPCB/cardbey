/**
 * Canonical runtime tool registry — single backend authority for proactive step execution.
 * Dashboard display lists may differ; execution validation must use this module.
 */

import { getToolDefinition } from '../toolRegistry.js';
import {
  PROACTIVE_RUNWAY_TOOL_SET,
  resolveRunwayDispatchToolName,
} from '../missionPlan/proactiveRunwayToolAllowlist.js';

/** Tools that may run as proactive runway steps (includes synonyms + special-case tokens). */
export function isProactiveRunwayTool(tool) {
  const normalized = normalizeToolName(tool);
  return Boolean(normalized) && PROACTIVE_RUNWAY_TOOL_SET.has(normalized);
}

/** Any tool known to the runtime (registry row or proactive runway synonym). */
export function isRuntimeTool(tool) {
  const normalized = normalizeToolName(tool);
  if (!normalized) return false;
  if (PROACTIVE_RUNWAY_TOOL_SET.has(normalized)) return true;
  return Boolean(getToolDefinition(normalized));
}

/**
 * @param {string} tool
 * @returns {'proactive_runway' | 'chat_only' | 'registry' | 'unknown'}
 */
export function getToolExecutionMode(tool) {
  const normalized = normalizeToolName(tool);
  if (!normalized) return 'unknown';
  if (normalized === 'general_chat') return 'chat_only';
  if (PROACTIVE_RUNWAY_TOOL_SET.has(normalized)) return 'proactive_runway';
  if (getToolDefinition(normalized)) return 'registry';
  return 'unknown';
}

/**
 * @param {string} tool
 * @returns {string}
 */
export function normalizeToolName(tool) {
  const raw = String(tool ?? '').trim().toLowerCase();
  if (!raw) return '';
  return resolveRunwayDispatchToolName(raw);
}

/**
 * Assert a tool may execute as a proactive mission step.
 * Never silently maps unknown tools to general_chat.
 *
 * @param {string} tool
 * @param {{ allowChatOnly?: boolean }} [context]
 * @returns {{ ok: true, canonicalTool: string, dispatchTool: string } | { ok: false, code: string, message: string }}
 */
export function assertExecutableTool(tool, context = {}) {
  const requested = String(tool ?? '').trim().toLowerCase();
  if (!requested) {
    return { ok: false, code: 'TOOL_REQUIRED', message: 'requestedTool is required' };
  }

  const canonical = normalizeToolName(requested);
  const mode = getToolExecutionMode(requested);

  if (mode === 'unknown') {
    return {
      ok: false,
      code: 'TOOL_UNKNOWN',
      message: `Tool "${requested}" is not registered for runtime execution`,
    };
  }

  if (mode === 'chat_only') {
    return {
      ok: false,
      code: 'TOOL_CHAT_ONLY',
      message: `Tool "general_chat" cannot execute proactive mission steps`,
    };
  }

  if (!isProactiveRunwayTool(canonical)) {
    return {
      ok: false,
      code: 'TOOL_NOT_RUNWAY',
      message: `Tool "${requested}" is not allowed on the proactive runway`,
    };
  }

  return {
    ok: true,
    canonicalTool: canonical,
    dispatchTool: resolveRunwayDispatchToolName(canonical),
  };
}
