/**
 * planner_checkpoint_delegate — honest UI checkpoint for review / selection steps.
 */

import { uiDelegateBlockedResult } from '../uiDelegateBlockedResult.js';

const DEFAULT_MESSAGES = {
  review_graphic: 'Review your generated graphic before applying it to your store',
  review_campaign: 'Review your campaign before launching',
  capture_requirements: 'Add any extra requirements for your store',
  select_products: 'Select products to include in this campaign',
};

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const toolName = String(context.requestedTool ?? input.toolName ?? 'mission_checkpoint').trim();
  const action = String(input.action ?? `checkpoint_${toolName}`).trim();
  const message =
    String(input.message ?? '').trim() ||
    DEFAULT_MESSAGES[toolName] ||
    'Confirm to continue';

  return uiDelegateBlockedResult({
    action,
    message,
    output: {
      toolName,
      checkpointType: input.checkpointType ?? 'review',
      ...input,
    },
  });
}

export default execute;
