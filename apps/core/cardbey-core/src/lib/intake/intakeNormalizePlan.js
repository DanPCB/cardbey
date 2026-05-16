/**
 * Deterministic plan normalization: prerequisite injection, domain closure, role ordering.
 */

import {
  getToolEntry,
  isRegisteredTool,
  allowedPlanToolClosure,
  planRoleOrder,
  PLAN_ROLE,
} from './intakeToolRegistry.js';

/**
 * Strip campaignContext from LLM-generated step parameters. Authoritative full OCR / campaign text lives in
 * intake proactive_plan `parameters.campaignContext`; step-level short summaries must not compete at runway merge.
 * @param {object | null | undefined} raw
 * @returns {Record<string, unknown>}
 */
function stepParametersWithoutCampaignContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const { campaignContext: _dropCampaignContext, ...cleanStepParams } = raw;
  return cleanStepParams;
}

/**
 * @param {string} destinationTool
 * @param {Array<{ step?: number, title?: string, description?: string, recommendedTool?: string, parameters?: object }>} llmPlan
 * @param {{ skipAnalyzeStorePrerequisite?: boolean }} [opts]
 * @returns {{ normalizedPlan: Array<{ step: number, title: string, description: string, recommendedTool: string, parameters?: object }>, injectedTools: string[], droppedTools: string[] }}
 */
export function normalizePlan(destinationTool, llmPlan, opts = {}) {
  const injectedTools = [];
  const droppedTools = [];

  const dest = getToolEntry(destinationTool);
  if (!dest || dest.executionPath !== 'proactive_plan') {
    const raw = Array.isArray(llmPlan) ? llmPlan : [];
    const normalizedPlan = raw
      .filter((s) => s && typeof s.recommendedTool === 'string' && isRegisteredTool(s.recommendedTool))
      .map((s, idx) => ({
        step: Number(s.step) || idx + 1,
        title: String(s.title || getToolEntry(s.recommendedTool)?.label || s.recommendedTool),
        description: String(s.description || `Run ${s.recommendedTool}`),
        recommendedTool: s.recommendedTool,
        parameters: stepParametersWithoutCampaignContext(s.parameters),
      }));
    return { normalizedPlan, injectedTools, droppedTools };
  }

  const allowed = allowedPlanToolClosure(destinationTool);
  const skipAnalyze =
    opts.skipAnalyzeStorePrerequisite === true &&
    destinationTool === 'improve_hero' &&
    Array.isArray(dest.prerequisiteTools) &&
    dest.prerequisiteTools.includes('analyze_store');
  const requiredSequence = skipAnalyze ? [destinationTool] : [...(dest.prerequisiteTools ?? []), destinationTool];

  const planMap = new Map();
  for (const step of llmPlan ?? []) {
    if (!step || typeof step.recommendedTool !== 'string') continue;
    const t = step.recommendedTool;
    if (!allowed.has(t)) {
      droppedTools.push(t);
      continue;
    }
    if (!planMap.has(t)) planMap.set(t, step);
  }

  for (const t of requiredSequence) {
    if (!planMap.has(t) && isRegisteredTool(t)) {
      injectedTools.push(t);
      const entry = getToolEntry(t);
      planMap.set(t, {
        recommendedTool: t,
        title: entry?.label ?? t,
        description: `Run ${entry?.label ?? t}`,
        parameters: {},
      });
    }
  }

  const toolsInPlan = [...planMap.keys()].filter((t) => allowed.has(t));

  const ordered = toolsInPlan.sort((a, b) => {
    const ea = getToolEntry(a);
    const eb = getToolEntry(b);
    const ra = ea?.planRole ?? PLAN_ROLE.STANDALONE;
    const rb = eb?.planRole ?? PLAN_ROLE.STANDALONE;
    const oa = planRoleOrder(ra);
    const ob = planRoleOrder(rb);
    if (oa !== ob) return oa - ob;
    return requiredSequence.indexOf(a) - requiredSequence.indexOf(b);
  });

  const normalizedPlan = ordered.map((t, idx) => {
    const llmStep = planMap.get(t);
    const entry = getToolEntry(t);
    return {
      step: idx + 1,
      title: String(llmStep?.title || entry?.label || t),
      description: String(llmStep?.description || `Run ${entry?.label ?? t}`),
      recommendedTool: t,
      parameters: stepParametersWithoutCampaignContext(llmStep?.parameters),
    };
  });

  return { normalizedPlan, injectedTools, droppedTools };
}
