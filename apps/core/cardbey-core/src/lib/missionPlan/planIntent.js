/**
 * Rule-based intent → execution plan (no LLM). Used by miIntentsRoutes.
 */

import crypto from 'node:crypto';

const INTENT_STEPS = {
  create_offer: [
    { agentType: 'analyze_store', label: 'Analyze store' },
    { agentType: 'generate_copy', label: 'Generate copy', checkpoint: true },
    { agentType: 'assign_promotion_slot', label: 'Assign promotion slot' },
  ],
  create_qr_for_offer: [
    { agentType: 'validate_offer', label: 'Validate offer' },
    { agentType: 'generate_qr', label: 'Generate QR' },
  ],
  generate_tags: [
    { agentType: 'analyze_store', label: 'Analyze store' },
    { agentType: 'generate_tags', label: 'Generate tags' },
  ],
  rewrite_descriptions: [
    { agentType: 'analyze_store', label: 'Analyze store' },
    { agentType: 'rewrite_descriptions', label: 'Rewrite descriptions' },
  ],
  generate_store_hero: [
    { agentType: 'analyze_store', label: 'Analyze store' },
    { agentType: 'generate_hero', label: 'Generate hero', checkpoint: true },
  ],
};

const DEFAULT_STEPS = [{ agentType: 'analyze_store', label: 'Analyze store' }];

/**
 * Build an execution plan for the given intent (rule-based only).
 * @param {string} intentType
 * @param {object} payload
 * @param {{ missionId?: string, intentId?: string }} context
 * @returns {import('./executionPlanTypes.js').ExecutionMissionPlan}
 */
export function planIntent(intentType, payload, context) {
  const intentId = context?.intentId ?? crypto.randomUUID();
  const planId = crypto.randomUUID();
  const stepSpecs = INTENT_STEPS[intentType] ?? DEFAULT_STEPS;

  const steps = stepSpecs.map((spec, index) => ({
    stepId: crypto.randomUUID(),
    order: index + 1,
    agentType: spec.agentType,
    label: spec.label,
    dependsOn: [],
    checkpoint: Boolean(spec.checkpoint),
    status: 'pending',
  }));

  return {
    planId,
    intentType: String(intentType),
    intentId,
    createdAt: new Date().toISOString(),
    source: 'rule',
    steps,
  };
}
