/**
 * Action planner — selected intent → governed runtime plan.
 */

import { getIntentNode } from './intentRegistry.js';
import { intentRequiresConfirmation } from './intentPolicies.js';
import { routeToChildAgent } from './childAgentRouter.js';
import type { EntityContext, PlannedVisionAction, UserSessionContext } from './types.js';

function buildPerformerPrompt(intentId: string, entity: EntityContext): string {
  const name = entity.entityName ?? 'this scan';
  switch (intentId) {
    case 'ask_about_store':
    case 'explain_only':
    case 'identify_product':
      return `What can you tell me about ${name}? Please keep it practical.`;
    case 'report_wrong_result':
      return `This scan result seems wrong for "${name}". Please help me understand what this actually points to: ${entity.rawPayload ?? entity.resolvedUrl ?? ''}`;
    case 'find_seller':
      return `Help me find who sells or offers ${name}.`;
    case 'compare_nearby':
      return `Show me similar businesses near ${name}.`;
    case 'translate_menu':
      return `Translate the menu from this scan for ${name}.`;
    default:
      return `Help me with "${intentId}" for ${name}.`;
  }
}

export function planVisionAction(input: {
  intentId: string;
  entity: EntityContext;
  session: UserSessionContext;
  confirmed?: boolean;
}): PlannedVisionAction | { error: string } {
  const node = getIntentNode(input.intentId);
  if (!node) return { error: 'unknown_intent' };

  if (intentRequiresConfirmation(node, input.confirmed) && node.confirmationRequired) {
    return { error: 'confirmation_required' };
  }

  const routed = routeToChildAgent(node, input.entity);

  const targetRuntime = node.clientHandled
    ? ('client' as const)
    : routed.targetRuntime;

  return {
    intentId: node.id,
    agentType: routed.agentType,
    runtimeAction: node.runtimeAction,
    targetRuntime,
    requiresConfirmation: node.confirmationRequired,
    requiresAuth: node.requiredPermissions.includes('authenticated'),
    missionType: routed.missionType,
    performerPrompt: routed.performerPrompt ?? buildPerformerPrompt(node.id, input.entity),
    clientAction: node.clientHandled ? node.runtimeAction : routed.clientAction ?? null,
    metadata: {
      entityContextId: input.entity.id,
      scanEventId: input.entity.scanEventId,
      entityType: input.entity.entityType,
      sourceType: input.entity.sourceType,
      agentType: routed.agentType,
      source: 'vision_scan',
    },
  };
}
