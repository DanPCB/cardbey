/**
 * Intent detection — EntityContext + session → ranked IntentSuggestion[].
 */

import { visionIntentGraph } from './IntentGraph.js';
import { evaluateIntentAvailability } from './intentPolicies.js';
import type { EntityContext, IntentSuggestion, UserSessionContext } from './types.js';

const INTENT_DESCRIPTIONS: Record<string, string> = {
  open_website: 'Open the linked page in your browser.',
  open_store: 'View this business on Cardbey.',
  save_to_suitcase: 'Save this link to your Suitcase vault.',
  save_store: 'Save this store for later.',
  share_store: 'Share with someone else.',
  ask_about_store: 'Ask PIL for more context — no medical advice.',
  create_prestore_candidate: 'Suggest this for Cardbey review before any public listing.',
  check_if_on_cardbey: 'See if we already have this business.',
  claim_business: 'Start a governed claim flow for your business.',
  explain_only: 'Get a plain-language explanation only.',
  do_not_store: 'Keep this scan private — nothing saved to discovery.',
  report_wrong_result: 'Tell us this result looks incorrect.',
  extract_menu_items: 'Extract menu items into a catalog draft.',
  contact_business: 'Draft outreach — requires your confirmation.',
};

function confidenceForIntent(intentId: string, entity: EntityContext, rank: number): number {
  let base = Math.max(0.45, entity.confidence - rank * 0.03);
  if (intentId === 'open_website' && entity.resolvedUrl) base = 0.95;
  if (intentId === 'open_store' && entity.cardbeyMatch?.storeId) base = 0.98;
  if (intentId === 'create_prestore_candidate' && !entity.cardbeyMatch?.storeId) base = 0.72;
  if (entity.entityType === 'sensitive_private' && intentId === 'explain_only') base = 0.9;
  return Math.min(0.99, base);
}

export function detectVisionIntents(
  entity: EntityContext,
  session: UserSessionContext,
): IntentSuggestion[] {
  const nodes = visionIntentGraph.rankSuggestions(
    visionIntentGraph.getNodesForEntity(entity),
    entity,
  );

  const suggestions: IntentSuggestion[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const { available, disabledReason } = evaluateIntentAvailability(node, entity, session);

    const targetRuntime = node.clientHandled
      ? ('client' as const)
      : ['ask_about_store', 'report_wrong_result', 'explain_only'].includes(node.id)
        ? ('performer' as const)
        : node.riskLevel === 'high' || node.confirmationRequired
          ? ('mission_pipeline' as const)
          : ('client' as const);

    suggestions.push({
      intentId: node.id,
      label: node.name,
      description: INTENT_DESCRIPTIONS[node.id] ?? node.name,
      confidence: confidenceForIntent(node.id, entity, i),
      riskLevel: node.riskLevel,
      requiresConfirmation: node.confirmationRequired,
      requiresAuth: node.requiredPermissions.includes('authenticated'),
      targetRuntime,
      suggestedAgent: node.agentType,
      disabledReason: available ? null : disabledReason,
    });
  }

  return suggestions
    .filter((s) => !s.disabledReason)
    .slice(0, 8);
}

export function listAllVisionIntentsShown(
  entity: EntityContext,
  session: UserSessionContext,
): string[] {
  return detectVisionIntents(entity, session).map((s) => s.intentId);
}
