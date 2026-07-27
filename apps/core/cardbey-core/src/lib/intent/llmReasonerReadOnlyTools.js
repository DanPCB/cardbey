/**
 * Read-only tools permitted during LLM reasoner ReAct context-gathering loop.
 */
import { INTAKE_TOOL_REGISTRY, RISK } from '../intake/intakeToolRegistry.js';
import { getToolDefinition } from '../toolRegistry.js';

/** Default allowlist — SAFE_READ context tools only. */
export const DEFAULT_LLM_TOOL_LOOP_ALLOWLIST = [
  'mcp_context_products',
  'mcp_context_business',
  'mcp_context_store_assets',
  'mcp_context_promotions',
  'mcp_context_missions',
  'mcp_context_analytics',
  'get_store_analytics',
  'get_review_summary',
  'market_research',
];

/**
 * @returns {string[]}
 */
export function getLlmReasonerReadOnlyToolAllowlist() {
  const fromEnv = String(process.env.LLM_TOOL_LOOP_ALLOWLIST ?? '').trim();
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_LLM_TOOL_LOOP_ALLOWLIST];
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isLlmReasonerReadOnlyTool(toolName) {
  const name = String(toolName ?? '').trim();
  if (!name) return false;
  const allow = new Set(getLlmReasonerReadOnlyToolAllowlist());
  if (!allow.has(name)) return false;

  const intakeEntry = INTAKE_TOOL_REGISTRY.find((t) => t.toolName === name);
  if (intakeEntry) {
    return intakeEntry.riskLevel === RISK.SAFE_READ;
  }

  if (name.startsWith('mcp_context_') && getToolDefinition(name)) {
    return true;
  }

  return false;
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} parameters
 * @param {Record<string, unknown>} context
 * @returns {Promise<{ success: boolean, data?: unknown, error?: string }>}
 */
export async function executeLlmReasonerReadOnlyTool(toolName, parameters, context) {
  const name = String(toolName ?? '').trim();
  if (!isLlmReasonerReadOnlyTool(name)) {
    return { success: false, error: `Tool ${name} is not an allowed read-only context tool` };
  }

  try {
    const { getExecutor } = await import('../toolExecutors/index.js');
    const executor = getExecutor(name);
    if (!executor?.execute) {
      return { success: false, error: `No executor registered for ${name}` };
    }

    const ctx =
      context && typeof context === 'object' && !Array.isArray(context) ? { ...context } : {};
    const params =
      parameters && typeof parameters === 'object' && !Array.isArray(parameters)
        ? { ...parameters }
        : {};

    const storeId =
      params.storeId ??
      ctx.storeId ??
      ctx.activeStoreId ??
      ctx.currentContext?.activeStoreId ??
      ctx.currentContext?.storeId ??
      null;
    if (storeId != null && params.storeId == null) {
      params.storeId = storeId;
    }

    const output = await executor.execute(params, {
      ...ctx,
      source: 'llm_reasoner_tool_loop',
      performerRuntimeOwned: true,
      runtimeOwned: true,
    });

    return { success: true, data: output };
  } catch (err) {
    return { success: false, error: err?.message ?? String(err) };
  }
}
