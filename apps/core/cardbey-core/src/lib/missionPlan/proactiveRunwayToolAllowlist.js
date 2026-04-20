/**
 * Full proactive runway + intake step allowlist — superset of toolRegistry.js TOOLS.
 * Both performerIntakeRoutes.js (PLAN_STEP_ALLOWED_TOOLS / ALLOWED_TOOLS) and
 * performerProactiveStepRoutes.js (ALLOWED_TOOLS Set) must use this list so they stay in sync.
 *
 * When adding a new tool in toolRegistry.js, it is picked up automatically via TOOLS.
 * Optional `aliases` on a tool row drive both resolveRunwayDispatchToolName and (except where noted)
 * allowlist membership for raw step tokens.
 *
 * Legacy: `mini_website` was never on the proactive allowlist as a raw token — it still resolves
 * via create_promotion.aliases but is excluded from PROACTIVE_RUNWAY_ALIAS_NAMES so set size matches history.
 */
import { TOOLS } from '../toolRegistry.js';

const FROM_REGISTRY = TOOLS.map((t) => t.toolName);

/** Lowercase alias → canonical toolName (includes mini_website for resolution). */
const RUNWAY_ALIAS_TO_CANONICAL = new Map();
for (const tool of TOOLS) {
  if (!Array.isArray(tool.aliases)) continue;
  for (const alias of tool.aliases) {
    const a = String(alias).trim().toLowerCase();
    RUNWAY_ALIAS_TO_CANONICAL.set(a, tool.toolName);
  }
}

/**
 * Alias strings that count as allowed raw `recommendedTool` values (same as pre-alias-map SYNONYM entries).
 * Omits `mini_website` — see module comment.
 */
export const PROACTIVE_RUNWAY_ALIAS_NAMES = [...RUNWAY_ALIAS_TO_CANONICAL.keys()].filter((a) => a !== 'mini_website');

/**
 * Tokens allowed on the runway that are not toolName rows and not registry-driven aliases.
 * general_chat / code_fix / generate_slideshow: special-case dispatch (see toolDispatcher).
 * Operator names: explicit listing so SYNONYM_TOOL_NAMES stays the contract for non-registry strings.
 */
export const SYNONYM_TOOL_NAMES = [
  'general_chat',
  'code_fix',
  'generate_slideshow',
  'start_build_store',
  'get_draft_by_run',
  'get_draft_summary',
  'poll_orchestra_job',
  'publish_store',
  'log_event',
  'run_pipeline',
];

/** @type {string[]} */
export const PROACTIVE_RUNWAY_TOOL_NAMES = [
  ...new Set([...FROM_REGISTRY, ...PROACTIVE_RUNWAY_ALIAS_NAMES, ...SYNONYM_TOOL_NAMES]),
];

export const PROACTIVE_RUNWAY_TOOL_SET = new Set(PROACTIVE_RUNWAY_TOOL_NAMES);

/**
 * Map plan/UI tool ids to canonical toolRegistry.js names for dispatchTool.
 *
 * @param {string} tool
 * @returns {string}
 */
export function resolveRunwayDispatchToolName(tool) {
  const t = String(tool ?? '').trim().toLowerCase();
  return RUNWAY_ALIAS_TO_CANONICAL.get(t) ?? t;
}
