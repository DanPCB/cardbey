// apps/core/cardbey-core/src/lib/intelligence/actionCatalog.ts

/**
 * Action Catalog - Single source of truth for intelligence actions
 * Merges: governance keys + opportunity types + concierge CTAs + discover intents
 */

import type { ActionCatalogEntry, PerformerToolId } from './types';

// Type for opportunity resolution (import from actual type when available)
type BusinessOpportunity = {
  recommendedAction: {
    type: string;
    label: string;
  };
  // ... other fields
};

// Opportunity Action Type to Performer Tool mapping for prepare_opportunity
export const OPPORTUNITY_TOOL_MAP: Partial<Record<string, string>> = {
  complete_profile: 'analyze_store',
  add_catalog_items: 'replace_store_catalog',
  create_offer: 'create_offer',
  launch_campaign: 'launch_campaign',
  create_loyalty_program: undefined, // no single tool; prefill only
  generate_video: 'video_generate_multimodal',
  review_store: 'analyze_store',
  review_messages: undefined,
  resume_mission: undefined,
};

// Opportunity Action Type to proposedAction mapping
export const OPPORTUNITY_PROPOSED_ACTION_MAP: Record<string, string> = {
  complete_profile: 'analyze_store',
  add_catalog_items: 'add_catalog_items',
  create_offer: 'create_offer',
  launch_campaign: 'launch_campaign',
  create_loyalty_program: 'create_loyalty_program',
  generate_video: 'generate_video',
  review_store: 'review_store',
  review_messages: 'review_messages',
  resume_mission: 'resume_mission',
};

// Concierge CTA Kind to PerformerToolId mapping (legacy bridge)
export const CONCIERGE_CTA_TO_TOOL_ID: Record<string, PerformerToolId> = {
  view_services: 'open_store_space',
  show_offers: 'view_offers',
  view_show: 'view_show',
  ask_performer: 'ask_performer',
  compare_options: 'compare_packages',
  save_for_later: 'save_for_later',
};

export const ACTION_CATALOG: Record<PerformerToolId, ActionCatalogEntry> = {
  explore_feed: {
    id: 'explore_feed',
    label: 'Start exploring',
    executionLane: 'navigation',
    proposedAction: 'explore_interest',
    handler: 'openProactiveIntelligenceIntent',
  },
  open_store_space: {
    id: 'open_store_space',
    label: 'Open space',
    executionLane: 'navigation',
    proposedAction: 'open_business',
    conciergeCtaKind: 'view_services',
    navigateTo: '/store/{storeId}?from=feed',
    handler: 'navigate',
  },
  view_offers: {
    id: 'view_offers',
    label: 'View offers',
    executionLane: 'navigation',
    proposedAction: 'review_offer',
    conciergeCtaKind: 'show_offers',
    handler: 'scrollToStoreSection',
    scrollTarget: 'offers',
  },
  view_show: {
    id: 'view_show',
    label: 'Open show',
    executionLane: 'navigation',
    proposedAction: 'view_insights',
    conciergeCtaKind: 'view_show',
    handler: 'scrollToStoreSection',
    scrollTarget: 'show',
  },
  ask_performer: {
    id: 'ask_performer',
    label: 'Ask Performer',
    executionLane: 'performer_prefill',
    proposedAction: 'run_performer',
    conciergeCtaKind: 'ask_performer',
    handler: 'openPerformerIntent',
    autoSubmit: false,
  },
  create_space: {
    id: 'create_space',
    label: 'Create my space',
    executionLane: 'navigation',
    proposedAction: 'draft_creation',
    performerToolName: 'start_build_store',
    navigateTo: '/space/create-business',
    handler: 'navigate',
  },
  create_offer: {
    id: 'create_offer',
    label: 'Create offer',
    executionLane: 'performer_prefill',
    proposedAction: 'create_offer',
    performerToolName: 'create_offer',
    opportunityActionType: 'create_offer',
    handler: 'openPerformerIntent',
    autoSubmit: false,
  },
  prepare_opportunity: {
    id: 'prepare_opportunity',
    label: 'Prepare action',
    executionLane: 'performer_prefill',
    proposedAction: '__dynamic_opportunity__',
    opportunityActionType: '__dynamic__',
    handler: 'toIncomingPerformerIntentFromOpportunity',
    autoSubmit: false,
    resolveProposedAction: (opportunity?: BusinessOpportunity) => {
      if (!opportunity) return 'analyze_store';
      const actionType = opportunity.recommendedAction?.type;
      return OPPORTUNITY_PROPOSED_ACTION_MAP[actionType] || 'analyze_store';
    },
    resolvePerformerToolName: (opportunity?: BusinessOpportunity) => {
      if (!opportunity) return undefined;
      const actionType = opportunity.recommendedAction?.type;
      return OPPORTUNITY_TOOL_MAP[actionType];
    },
  },
  review_briefing: {
    id: 'review_briefing',
    label: 'Review briefing',
    executionLane: 'navigation',
    proposedAction: 'view_insights',
    handler: 'focusBriefingPanel',
  },
  open_suitcase: {
    id: 'open_suitcase',
    label: 'Open suitcase',
    executionLane: 'navigation',
    proposedAction: 'navigation_read_only',
    navigateTo: '/suitcase/vault?storeId={storeId}',
    handler: 'navigate',
  },
  compare_packages: {
    id: 'compare_packages',
    label: 'Compare packages',
    executionLane: 'performer_prefill',
    proposedAction: 'compare_packages',
    conciergeCtaKind: 'compare_options',
    handler: 'openConciergeDialogue',
    autoSubmit: false,
  },
  save_for_later: {
    id: 'save_for_later',
    label: 'Save for later',
    executionLane: 'session_only',
    proposedAction: 'save_for_later',
    conciergeCtaKind: 'save_for_later',
    handler: 'conciergeSaveForLater',
  },
  show_briefing: {
    id: 'show_briefing',
    label: 'Show briefing',
    executionLane: 'navigation',
    proposedAction: 'view_insights',
    handler: 'focusBriefingPanel',
  },
  remind_later: {
    id: 'remind_later',
    label: 'Remind later',
    executionLane: 'session_only',
    proposedAction: 'recommendation',
    handler: 'recordBusinessRemindLater',
  },
  dismiss: {
    id: 'dismiss',
    label: 'Dismiss',
    executionLane: 'session_only',
    proposedAction: 'recommendation',
    handler: 'recordBusinessDismissed',
  },
  launch_campaign: {
    id: 'launch_campaign',
    label: 'Launch campaign',
    executionLane: 'performer_prefill',
    proposedAction: 'launch_campaign',
    performerToolName: 'launch_campaign',
    opportunityActionType: 'launch_campaign',
    handler: 'openPerformerIntent',
    autoSubmit: false,
  },
  // Extensions (Phase 2-3)
  generate_video: {
    id: 'generate_video',
    label: 'Generate video',
    executionLane: 'performer_prefill',
    proposedAction: 'generate_creative',
    performerToolName: 'video_generate_multimodal',
    opportunityActionType: 'generate_video',
    handler: 'openPerformerIntent',
    autoSubmit: false,
  },
  complete_profile: {
    id: 'complete_profile',
    label: 'Complete profile',
    executionLane: 'performer_prefill',
    proposedAction: 'analyze_store',
    performerToolName: 'analyze_store',
    opportunityActionType: 'complete_profile',
    handler: 'openPerformerIntent',
    autoSubmit: false,
  },
  open_offer: {
    id: 'open_offer',
    label: 'Open offer',
    executionLane: 'navigation',
    proposedAction: 'open_offer',
    navigateTo: '/p/{storeSlug}/offers/{offerSlug}',
    handler: 'navigate',
  },
};

// Helper: Get action by ID
export function getActionById(id: PerformerToolId): ActionCatalogEntry | undefined {
  return ACTION_CATALOG[id];
}

// Helper: Resolve dynamic proposedAction for prepare_opportunity
export function resolveDynamicProposedAction(
  toolId: PerformerToolId,
  opportunity?: BusinessOpportunity
): string {
  const entry = ACTION_CATALOG[toolId];
  if (entry?.resolveProposedAction && opportunity) {
    return entry.resolveProposedAction(opportunity);
  }
  return entry?.proposedAction || 'analyze_store';
}

// Helper: Check if action requires confirmation (delegates to governance)
// This is a stub - actual implementation calls requiresUserConfirmation from safeExecutionGovernance
export function requiresConfirmation(proposedAction: string): boolean {
  const confirmationRequiredActions = new Set([
    'explore_interest',
    'run_performer',
    'create_offer',
    'launch_campaign',
    'compare_packages',
    'save_for_later',
    'review_offer',
    'analyze_store',
  ]);
  
  const noConfirmationActions = new Set([
    'navigation_read_only',
    'draft_creation',
    'view_insights',
    'recommendation',
    'open_business',
  ]);
  
  if (noConfirmationActions.has(proposedAction)) return false;
  if (confirmationRequiredActions.has(proposedAction)) return true;
  
  // Default to true for unknown actions (safe default per SEG-4)
  return true;
}