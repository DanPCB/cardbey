/**
 * Performer intake routing — when store context is required vs open chat.
 */

import { getToolEntry } from './intakeToolRegistry.js';

const STORE_SCOPED_INTENTS = new Set([
  'add_product',
  'create_campaign',
  'publish_store',
  'setup_loyalty',
  'view_analytics',
  'generate_graphic',
  'update_store',
  'upload_asset',
  'select_store_first',
]);

/**
 * @param {{ intent?: string | null; tool?: string | null }} input
 */
export function intentRequiresActiveStoreContext(input = {}) {
  const tool = String(input.tool ?? '').trim();
  if (tool) {
    const entry = getToolEntry(tool);
    if (entry?.requiresStore) return true;
  }
  const intent = String(input.intent ?? '').trim();
  return STORE_SCOPED_INTENTS.has(intent);
}

/**
 * Store picker is only appropriate when the classified intent needs a business context.
 *
 * @param {import('../intent/intentTypes.js').IntentReasoningResult} result
 */
export function shouldOfferStoreSelectionClarify(result) {
  if (!result || typeof result !== 'object') return false;
  const userState = result.userState;
  if (!userState?.accountHasStores || userState.hasActiveStoreContext) return false;
  const stores = Array.isArray(userState.accountStoreCandidates) ? userState.accountStoreCandidates : [];
  if (stores.length === 0) return false;

  if (result.intent === 'select_store_first') return true;
  if (result.intent === 'create_store' || result.intent === 'create_store_first') return false;

  return intentRequiresActiveStoreContext({
    intent: result.intent,
    tool: result.tool,
  });
}

/**
 * Defer proactive_plan mission start until store context is resolved (multi-store only).
 *
 * @param {{
 *   intent?: string | null;
 *   tool?: string | null;
 *   hasActiveStoreContext?: boolean;
 *   accountHasStores?: boolean;
 *   accountStoreCount?: number;
 * }} input
 */
export function shouldDeferMissionForStoreContext(input = {}) {
  if (Boolean(input.hasActiveStoreContext)) return false;
  if (!Boolean(input.accountHasStores)) return false;
  const count = typeof input.accountStoreCount === 'number' ? input.accountStoreCount : 0;
  if (count <= 1) return false;
  return intentRequiresActiveStoreContext({
    intent: input.intent,
    tool: input.tool,
  });
}
