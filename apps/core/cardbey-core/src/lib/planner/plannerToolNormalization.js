/**
 * Normalize planner template tool names to registered runtime tools.
 */

import { getToolDefinition } from '../toolRegistry.js';
import { isRuntimeTool } from '../runtime/runtimeToolRegistry.js';

/** @type {Record<string, string>} */
export const PLANNER_TOOL_ALIASES = {
  validate_store_input: 'validate_store_context',
  upload_catalog: 'replace_store_catalog',
  parse_catalog: 'prepare_catalog',
  validate_catalog: 'validate_products',
  analyze_campaign_goal: 'create_campaign_brief',
  generate_graphic: 'create_promotion_graphic',
  apply_graphic: 'upload_store_asset',
  upload_logo: 'upload_store_asset',
  create_store_record: 'create_store',
  finalize_store: 'publish_store',
};

/**
 * @param {string | null | undefined} tool
 * @returns {string | null}
 */
export function normalizePlannerToolName(tool) {
  const raw = String(tool ?? '').trim();
  if (!raw) return null;
  return PLANNER_TOOL_ALIASES[raw] ?? raw;
}

/**
 * @param {import('./plannerTypes.js').PlanStep} step
 * @returns {import('./plannerTypes.js').PlanStep}
 */
export function normalizePlanStep(step) {
  if (!step || typeof step !== 'object') return step;

  const originalTool = typeof step.tool === 'string' ? step.tool : null;
  const normalizedTool = originalTool ? normalizePlannerToolName(originalTool) : null;

  let next = {
    ...step,
    tool: normalizedTool,
    ...(originalTool && normalizedTool && originalTool !== normalizedTool
      ? { originalTool, normalized: true }
      : {}),
  };

  if (normalizedTool && step.type !== 'checkpoint' && !isRuntimeTool(normalizedTool)) {
    next = {
      ...next,
      preview_only: true,
      label: `${step.label} (preview)`,
      previewReason: `Tool "${normalizedTool}" is not registered for runtime execution`,
    };
  }

  return next;
}

/**
 * @param {import('./plannerTypes.js').PlanStep[]} steps
 * @returns {import('./plannerTypes.js').PlanStep[]}
 */
export function normalizePlanSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => normalizePlanStep(step));
}

/**
 * @param {import('./plannerTypes.js').DynamicPlan} plan
 * @returns {import('./plannerTypes.js').DynamicPlan}
 */
export function normalizePlanTools(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  return {
    ...plan,
    steps: normalizePlanSteps(plan.steps),
  };
}

/**
 * @param {import('./plannerTypes.js').PlanStep[]} steps
 * @returns {import('./plannerTypes.js').PlanStep[]}
 */
export function markPreviewOnlySteps(steps) {
  return steps.map((step) => {
    const tool = typeof step.tool === 'string' ? step.tool : null;
    if (!tool || step.preview_only || step.type === 'checkpoint') return step;
    if (getToolDefinition(tool) || isRuntimeTool(tool)) return step;
    return {
      ...step,
      preview_only: true,
      label: `${step.label} (preview only)`,
      previewReason: `Tool "${tool}" not implemented yet`,
    };
  });
}
