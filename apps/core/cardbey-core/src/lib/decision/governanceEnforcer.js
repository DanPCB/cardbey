/**
 * Post-decision governance — confirmation checkpoints and guest auth gates.
 */

import { evaluateToolGovernance } from './governancePolicy.js';

const REQUIRES_AUTH = new Set([
  'create_campaign',
  'launch_campaign',
  'create_promotion',
  'activate_campaigns',
  'publish_store',
  'signage.publish-to-devices',
  'create_store',
]);

/**
 * @param {import('./decideTurn.js').TurnResult} turnResult
 * @param {{ isGuest?: boolean; confirmed?: boolean }} [context]
 * @returns {import('./decideTurn.js').TurnResult}
 */
export function applyGovernanceEnforcer(turnResult, context = {}) {
  const toolName = turnResult.tool?.name ?? null;
  const baseGovernance = evaluateToolGovernance(toolName);
  let nextStep = turnResult.nextStep;
  let governance = {
    ...turnResult.governance,
    ...baseGovernance,
  };

  if (
    baseGovernance.requiresConfirmation &&
    !context.confirmed &&
    nextStep === 'execute'
  ) {
    nextStep = 'checkpoint';
    governance = {
      ...governance,
      requiresConfirmation: true,
      confirmationState: 'pending',
      reason: `${toolName} affects live customers or data`,
      proposedAction: toolName,
    };
  }

  if (context.isGuest && toolName && REQUIRES_AUTH.has(toolName) && nextStep === 'execute') {
    nextStep = 'guide_auth';
    governance = {
      ...governance,
      requiresAuth: true,
      reason: 'You need to sign in to perform this action',
    };
  }

  return {
    ...turnResult,
    nextStep,
    governance,
  };
}
