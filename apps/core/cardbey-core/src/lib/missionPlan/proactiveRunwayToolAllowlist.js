/**
 * Full proactive runway + intake step allowlist — superset of toolRegistry.js TOOLS.
 * Both performerIntakeRoutes.js (PLAN_STEP_ALLOWED_TOOLS / ALLOWED_TOOLS) and
 * performerProactiveStepRoutes.js (ALLOWED_TOOLS Set) must use this list so they stay in sync.
 *
 * When adding a new tool in toolRegistry.js, it is picked up automatically via TOOLS.
 * Add UI-only or legacy aliases only in SYNONYM_TOOL_NAMES below.
 */
import { TOOLS } from '../toolRegistry.js';

const FROM_REGISTRY = TOOLS.map((t) => t.toolName);

/**
 * Plan/UI aliases not in TOOLS; performerProactiveStepRoutes resolveDispatchToolName maps these to registry names.
 */
/** UI / legacy aliases allowed on the runway but not necessarily in {@link TOOLS}. */
export const SYNONYM_TOOL_NAMES = [
  'campaign_research',
  'smart_visual',
  'general_chat',
  'generate_mini_website',
  'social_posts',
  'rewrite',
  'hero',
  'analyze',
  'tags',
  'content',
  // LLM drift → activate_promotion (resolveDispatchToolName maps these)
  'show_promotion',
  'display_promotion',
  'publish_promotion',
  'show_promo',
  /** Performer: natural-language bug → proposed patch (no registry executor). */
  'code_fix',
  /** Client-side GIF slideshow from Content Studio; server returns pending_client_export. */
  'generate_slideshow',
];

/** @type {string[]} */
export const PROACTIVE_RUNWAY_TOOL_NAMES = [...new Set([...FROM_REGISTRY, ...SYNONYM_TOOL_NAMES])];

export const PROACTIVE_RUNWAY_TOOL_SET = new Set(PROACTIVE_RUNWAY_TOOL_NAMES);

/**
 * Map plan/UI tool ids to canonical toolRegistry.js names for dispatchTool.
 * Keep this logic centralized to avoid runway drift between endpoints.
 *
 * @param {string} tool
 * @returns {string}
 */
export function resolveRunwayDispatchToolName(tool) {
  const t = String(tool || '').trim().toLowerCase();
  if (t === 'campaign_research') return 'market_research';
  if (t === 'smart_visual' || t === 'generate_mini_website' || t === 'mini_website') return 'create_promotion';
  if (t === 'social_posts') return 'generate_social_posts';
  if (t === 'rewrite') return 'rewrite_descriptions';
  if (t === 'hero') return 'improve_hero';
  if (t === 'analyze') return 'analyze_store';
  if (t === 'tags') return 'generate_tags';
  if (t === 'content') return 'content_creator';
  if (t === 'show_promotion' || t === 'display_promotion' || t === 'publish_promotion' || t === 'show_promo') {
    return 'activate_promotion';
  }
  return t;
}
