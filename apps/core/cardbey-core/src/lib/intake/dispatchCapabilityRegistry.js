/**
 * Backend capability registry — mirrors dashboard capabilitySelector registry.
 */

import { collectLearnedSignals, hasLearnedSignal, MEMORY_SIGNAL_KEYS } from './dispatchMemorySignals.js';

/** @type {Record<string, { id: string; channel: string; uiAction?: string; httpPath?: string; requiresConfirmation: boolean; proposedAction?: string }>} */
export const CAPABILITY_REGISTRY = {
  update_hero_artifact: {
    id: 'update_hero_artifact',
    channel: 'ui_runtime',
    uiAction: 'update_hero_artifact',
    requiresConfirmation: false,
  },
  update_avatar_artifact: {
    id: 'update_avatar_artifact',
    channel: 'ui_runtime',
    uiAction: 'update_avatar_artifact',
    requiresConfirmation: false,
  },
  save_draft_preview: {
    id: 'save_draft_preview',
    channel: 'ui_runtime',
    uiAction: 'save_draft_preview',
    requiresConfirmation: false,
  },
  publish_store: {
    id: 'publish_store',
    channel: 'ui_runtime',
    uiAction: 'publish_store',
    requiresConfirmation: true,
    proposedAction: 'publish',
  },
  republish_website: {
    id: 'republish_website',
    channel: 'ui_runtime',
    uiAction: 'publish_store',
    requiresConfirmation: true,
    proposedAction: 'publish',
  },
  publish_cardbey: {
    id: 'publish_cardbey',
    channel: 'ui_runtime',
    uiAction: 'publish_cardbey',
    requiresConfirmation: true,
    proposedAction: 'publish',
  },
  publish_custom_domain: {
    id: 'publish_custom_domain',
    channel: 'ui_runtime',
    uiAction: 'publish_custom_domain',
    requiresConfirmation: true,
    proposedAction: 'publish',
  },
  publish_campaign: {
    id: 'publish_campaign',
    channel: 'ui_runtime',
    uiAction: 'publish_campaign',
    requiresConfirmation: true,
    proposedAction: 'launch_campaign',
  },
  render_creative_asset: {
    id: 'render_creative_asset',
    channel: 'ui_runtime',
    uiAction: 'render_creative_asset',
    requiresConfirmation: false,
  },
  delete_store: {
    id: 'delete_store',
    channel: 'http_delete',
    requiresConfirmation: true,
    proposedAction: 'data_deletion',
    httpPath: '/stores',
  },
  delete_content: {
    id: 'delete_content',
    channel: 'http_delete',
    requiresConfirmation: true,
    proposedAction: 'data_deletion',
    httpPath: '/api/contents',
  },
  delete_product: {
    id: 'delete_product',
    channel: 'http_delete',
    requiresConfirmation: true,
    proposedAction: 'data_deletion',
    httpPath: '/api/products',
  },
  create_offer_draft: {
    id: 'create_offer_draft',
    channel: 'http_post',
    requiresConfirmation: true,
    proposedAction: 'create_offer',
    httpPath: '/api/performer/runtime/capabilities/create-offer-draft',
  },
  create_offer: {
    id: 'create_offer',
    channel: 'http_post',
    requiresConfirmation: true,
    proposedAction: 'create_offer',
    httpPath: '/api/performer/runtime/capabilities/create-offer-draft',
  },
  ingest_document: {
    id: 'ingest_document',
    channel: 'performer_intake',
    requiresConfirmation: false,
    proposedAction: 'draft_creation',
  },
  launch_campaign: {
    id: 'launch_campaign',
    channel: 'performer_intake',
    requiresConfirmation: true,
    proposedAction: 'launch_campaign',
  },
  generate_video: {
    id: 'generate_video',
    channel: 'performer_intake',
    requiresConfirmation: true,
    proposedAction: 'generate_creative',
  },
  create_promotion_graphic: {
    id: 'create_promotion_graphic',
    channel: 'performer_intake',
    requiresConfirmation: false,
    proposedAction: 'generate_creative',
  },
  analyze_store: {
    id: 'analyze_store',
    channel: 'performer_intake',
    requiresConfirmation: false,
    proposedAction: 'analysis',
  },
  analyze_engagement: {
    id: 'analyze_engagement',
    channel: 'performer_intake',
    requiresConfirmation: false,
    proposedAction: 'analysis',
  },
  proactive_runway_step: {
    id: 'proactive_runway_step',
    channel: 'runtime_mission_step',
    requiresConfirmation: false,
    proposedAction: 'launch_campaign',
  },
  generate_full_store_from_seed: {
    id: 'generate_full_store_from_seed',
    channel: 'ui_runtime',
    uiAction: 'generate_full_store_from_seed',
    requiresConfirmation: false,
    proposedAction: 'draft_creation',
  },
};

/**
 * @param {string} actionType
 * @param {Record<string, unknown> | null | undefined} memoryBundle
 */
export function selectDispatchCapability(actionType, memoryBundle) {
  const key = String(actionType ?? '').trim();
  let selected = CAPABILITY_REGISTRY[key];
  const signals = collectLearnedSignals(memoryBundle);

  if (
    hasLearnedSignal(signals, MEMORY_SIGNAL_KEYS.EXIT_INTENT) &&
    key === 'launch_campaign' &&
    CAPABILITY_REGISTRY.analyze_engagement
  ) {
    selected = CAPABILITY_REGISTRY.analyze_engagement;
  }

  if (selected) {
    return { ...selected };
  }

  return {
    id: key,
    channel: 'ui_runtime',
    uiAction: key,
    requiresConfirmation: false,
  };
}
