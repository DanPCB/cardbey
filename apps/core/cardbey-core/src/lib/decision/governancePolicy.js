/**
 * Post-reasoning governance for decision loop (Phase 3).
 */

import { getToolEntry } from '../intake/intakeToolRegistry.js';

/** High-impact tools that must never auto-submit from the decision loop. */
const NEVER_AUTO_SUBMIT = new Set([
  'create_campaign',
  'launch_campaign',
  'create_promotion',
  'activate_campaigns',
  'publish_store',
  'signage.publish-to-devices',
]);

/**
 * @param {string | null | undefined} toolName
 */
export function evaluateToolGovernance(toolName) {
  const tool = String(toolName ?? '').trim();
  if (!tool) {
    return {
      requiresConfirmation: false,
      confirmationState: 'not_required',
      proposedAction: null,
    };
  }

  const entry = getToolEntry(tool);
  const requiresConfirmation = Boolean(entry?.approvalRequired) || NEVER_AUTO_SUBMIT.has(tool);

  return {
    requiresConfirmation,
    confirmationState: requiresConfirmation ? 'pending' : 'not_required',
    proposedAction: tool,
  };
}
