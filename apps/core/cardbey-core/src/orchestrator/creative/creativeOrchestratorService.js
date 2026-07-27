/**
 * Creative Orchestrator Service
 * Encapsulates the integration between Orchestrator and Creative Agent
 */

import { DefaultCreativeAgent } from '../../agents/creative/creativeAgent.js';

/**
 * Infer scene type from orchestrator context and entry point
 * Simple heuristics for now - can be enhanced with ML later
 * 
 * @param {Object} context - Orchestrator context
 * @param {string} [entryPoint] - Entry point identifier
 * @returns {string} Scene type for Creative Agent
 */
function inferSceneTypeFromContext(context, entryPoint) {
  // Simple heuristics based on entry point
  if (entryPoint === 'loyalty_from_card') return 'loyalty_card';
  if (entryPoint === 'shopfront_signage') return 'shopfront';
  if (entryPoint === 'menu_from_photo') return 'menu_photo';
  if (entryPoint === 'campaign_setup') return 'campaign_setup';
  
  // TODO: If context has hints in extractedData or metadata, extend this logic
  // For example: if context.metadata?.detectedObjects?.includes('menu'), return 'menu_photo'
  
  return 'generic';
}

/**
 * Summarize a plan for Creative Agent consumption
 * Creates a human-readable summary of what the plan will do
 * 
 * @param {Object} plan - Orchestrator plan to summarize
 * @returns {string} Plan summary string
 */
function summarizePlanForCreative(plan) {
  const stepCount = plan.steps?.length || 0;
  const stepTypes = plan.steps?.map(s => s.type).join(', ') || 'none';
  
  if (stepCount === 0) {
    return `Empty plan with no steps`;
  }
  
  return `Plan with ${stepCount} step${stepCount > 1 ? 's' : ''} (${stepTypes})`;
}

export async function generateCreativeProposalsForPlan(context, intent, plan, entryPoint) {
  const creativeAgent = new DefaultCreativeAgent();
  
  // Build CreativeContext from OrchestratorContext
  const creativeContext = {
    storeId: context.storeId || '',
    userId: context.userId,
    businessType: context.storeProfile?.type || context.metadata?.businessType,
    country: context.storeProfile?.settings?.country || context.metadata?.country,
    sceneType: inferSceneTypeFromContext(context, entryPoint),
    extractedData: context.metadata?.extractedData || {},
    currentIntent: intent.type || intent.parameters?.goal,
    currentPlanSummary: summarizePlanForCreative(plan),
  };
  
  return creativeAgent.generateProposals(creativeContext);
}

