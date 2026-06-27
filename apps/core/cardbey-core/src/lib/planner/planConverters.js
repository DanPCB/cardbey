/**
 * Shared conversions between DynamicPlan and proactive-plan / client shapes.
 */

/**
 * @param {import('./plannerTypes.js').DynamicPlan} plan
 */
export function dynamicPlanToProactivePlanSteps(plan) {
  return (plan.steps || []).map((step, idx) => ({
    step: step.order || idx + 1,
    title: step.label || step.name || `Step ${idx + 1}`,
    description:
      step.type === 'checkpoint'
        ? step.checkpointConfig?.prompt || step.name || ''
        : step.name || '',
    recommendedTool: step.tool || undefined,
    planRole: step.type === 'checkpoint' ? 'checkpoint' : 'action',
    parameters: {},
    dynamicStepId: step.id,
    optional: step.optional,
    checkpoint: step.checkpointConfig ?? null,
  }));
}

/**
 * @param {import('./plannerTypes.js').DynamicPlan} plan
 */
export function serializeDynamicPlanForClient(plan) {
  return {
    planId: plan.planId,
    intent: plan.intent,
    workflow: plan.workflow,
    version: plan.version,
    steps: (plan.steps || []).map((step) => ({
      id: step.id,
      name: step.name,
      label: step.label,
      labels: step.labels ?? { en: step.label },
      type: step.type,
      tool: step.tool,
      order: step.order,
      optional: step.optional,
      dependencies: step.dependencies,
      estimatedDuration: step.estimatedDuration,
      checkpoint: step.checkpointConfig ?? null,
    })),
    metadata: plan.metadata,
    reasoning: plan.reasoning,
    generatedAt: plan.generatedAt,
  };
}
