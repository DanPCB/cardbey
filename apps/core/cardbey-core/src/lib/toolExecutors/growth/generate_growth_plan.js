/**
 * generate_growth_plan — Ranked growth actions from local presence audit.
 */

import { randomUUID } from 'node:crypto';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

/** @type {Record<string, { skillToRun: string, effort: string, title: string, description: string, estimatedImpact: string }>} */
const GAP_ACTION_TEMPLATES = {
  'no active offer': {
    skillToRun: 'offer_optimization',
    effort: 'low',
    title: 'Optimize active offers',
    description: 'Tune or launch a promotion to drive immediate local conversions.',
    estimatedImpact: 'High — fills biggest offer gap',
  },
  'profile incomplete': {
    skillToRun: 'store_launch',
    effort: 'low',
    title: 'Complete store profile',
    description: 'Finish brand kit, hero, and core store details to improve discovery.',
    estimatedImpact: 'High — improves profile completeness',
  },
  'no social links': {
    skillToRun: 'store_launch',
    effort: 'low',
    title: 'Connect social accounts',
    description: 'Link social profiles so campaigns can reach local followers.',
    estimatedImpact: 'Medium — expands social reach',
  },
  'low content freshness': {
    skillToRun: 'campaign',
    effort: 'medium',
    title: 'Launch fresh campaign',
    description: 'Create new campaign content to re-engage local customers.',
    estimatedImpact: 'High — refreshes stale presence',
  },
  'no display device': {
    skillToRun: 'smart_display_publish',
    effort: 'high',
    title: 'Publish to in-store display',
    description: 'Pair a screen and push campaign content to physical signage.',
    estimatedImpact: 'Medium — adds in-store visibility',
  },
};

const DEFAULT_ACTION = {
  skillToRun: 'campaign',
  effort: 'medium',
  title: 'Run a local growth campaign',
  description: 'Create and publish a campaign tailored to nearby customers.',
  estimatedImpact: 'Medium — general visibility boost',
};

const ALLOWED_GOALS = new Set(['more_customers', 'more_revenue', 'more_visibility']);

/**
 * @param {string[]} gaps
 * @param {string[]} goals
 * @returns {Array<object>}
 */
function buildActions(gaps, goals) {
  /** @type {Array<object>} */
  const actions = [];
  const seen = new Set();
  const gapList = Array.isArray(gaps) && gaps.length ? gaps : ['low content freshness'];

  for (const gap of gapList) {
    const template = GAP_ACTION_TEMPLATES[gap] ?? DEFAULT_ACTION;
    if (seen.has(template.skillToRun)) continue;
    seen.add(template.skillToRun);
    actions.push({
      id: randomUUID(),
      rank: actions.length + 1,
      ...template,
      gap,
      goals,
      autoExecute: false,
    });
    if (actions.length >= 5) break;
  }

  if (actions.length === 0) {
    actions.push({
      id: randomUUID(),
      rank: 1,
      ...DEFAULT_ACTION,
      gap: 'general growth',
      goals,
      autoExecute: false,
    });
  }

  return actions.map((action, index) => ({ ...action, rank: index + 1 }));
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeAnalysisTool({
    toolName: 'generate_growth_plan',
    input,
    context,
    analyzer: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const audit = inp?.audit && typeof inp.audit === 'object' ? inp.audit : {};
      const businessType =
        typeof inp?.businessType === 'string' && inp.businessType.trim()
          ? inp.businessType.trim()
          : null;

      const goalsRaw = Array.isArray(inp?.goals) ? inp.goals : ['more_customers'];
      const goals = goalsRaw.map((g) => String(g).trim()).filter((g) => ALLOWED_GOALS.has(g));
      const normalizedGoals = goals.length ? goals : ['more_customers'];

      const actions = buildActions(audit.gaps, normalizedGoals);
      const topAction = actions[0] ?? null;

      return {
        plan: {
          storeId,
          businessType,
          generatedAt: new Date().toISOString(),
          goals: normalizedGoals,
          actions,
          topAction,
          planId: randomUUID(),
        },
      };
    },
    isEmpty: (result) => !Array.isArray(result?.plan?.actions) || result.plan.actions.length === 0,
    countRecords: (result) => result?.plan?.actions?.length ?? 0,
  });
}

export default execute;
