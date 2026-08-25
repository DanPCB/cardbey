/**
 * Derive 30/60/90 plan from accepted recommendations — Phase D6.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { planItem } from './fullAnalysisTypes.js';

/**
 * @param {object[]} recommendations
 */
export function buildPlanFromRecommendations(recommendations = []) {
  const sorted = recommendations
    .slice()
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

  const day30 = [];
  const day60 = [];
  const day90 = [];
  let prev = null;

  for (const rec of sorted) {
    const action = rec.recommendedAction || rec.recommendation || rec.title;
    if (!action) continue;
    const item = planItem({
      id: `plan_${rec.id}`,
      action,
      reason: rec.whyItMatters || rec.interpretation || 'Derived from an accepted recommendation.',
      priority: rec.priority || 'medium',
      dependency: prev,
      evidenceOrAssumption: (rec.evidenceRefs || []).join(', ') || rec.signal || null,
      knowledgeState: KNOWLEDGE_STATES.RECOMMENDATION,
      cardbeyAction: rec.possibleCardbeyAction || rec.cardbeyExecution || null,
      expectedOutput: rec.expectedOutput || 'Measurable progress on this recommendation',
      sourceRecommendationId: rec.id,
    });

    if (rec.priority === 'high' && day30.length < 3) {
      day30.push(item);
      prev = item.id;
    } else if (day60.length < 3 && (rec.priority === 'high' || rec.priority === 'medium')) {
      day60.push(item);
      prev = item.id;
    } else if (day90.length < 3) {
      day90.push(item);
      prev = item.id;
    }
  }

  // Ensure each horizon has at least something when recs exist
  if (!day30.length && sorted[0]) {
    day30.push(
      planItem({
        id: `plan_30_${sorted[0].id}`,
        action: sorted[0].recommendedAction || sorted[0].recommendation,
        reason: sorted[0].whyItMatters || 'Foundational priority.',
        priority: 'high',
        cardbeyAction: sorted[0].possibleCardbeyAction,
        knowledgeState: KNOWLEDGE_STATES.RECOMMENDATION,
      }),
    );
  }
  if (!day60.length && sorted[1]) {
    day60.push(
      planItem({
        id: `plan_60_${sorted[1].id}`,
        action: sorted[1].recommendedAction || sorted[1].recommendation,
        reason: sorted[1].whyItMatters || 'Capability development.',
        priority: sorted[1].priority || 'medium',
        dependency: day30[0]?.id || null,
        cardbeyAction: sorted[1].possibleCardbeyAction,
      }),
    );
  }
  if (!day90.length && sorted[2]) {
    day90.push(
      planItem({
        id: `plan_90_${sorted[2].id}`,
        action: sorted[2].recommendedAction || sorted[2].recommendation,
        reason: sorted[2].whyItMatters || 'Later experiment / growth activity.',
        priority: sorted[2].priority || 'medium',
        dependency: day60[0]?.id || day30[0]?.id || null,
        cardbeyAction: sorted[2].possibleCardbeyAction,
      }),
    );
  } else if (!day90.length && day60[0]) {
    day90.push(
      planItem({
        id: 'plan_90_review',
        action: 'Review outcomes of the 30/60-day actions and refine the next evidence-backed priority.',
        reason: 'Plans should iterate from observed results — success is not guaranteed.',
        priority: 'medium',
        dependency: day60[0].id,
        knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
        cardbeyAction: null,
      }),
    );
  }

  return { day30, day60, day90 };
}

function priorityRank(p) {
  if (p === 'high') return 0;
  if (p === 'medium') return 1;
  return 2;
}
