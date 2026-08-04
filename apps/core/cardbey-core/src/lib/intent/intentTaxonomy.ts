/**
 * Unified intent taxonomy metadata + cross-system adapters (Phase 2).
 * Canonical string values remain INTENT_TYPE_LIST / IntentType in intentTypes.ts.
 */

import { INTENT_TYPE_LIST } from './constants.js';
import type { IntentType } from './intentTypes.js';

export type IntentCategory =
  | 'store_management'
  | 'product_management'
  | 'campaign_management'
  | 'catalog_management'
  | 'promotion_management'
  | 'asset_management'
  | 'analytics'
  | 'content'
  | 'loyalty'
  | 'discovery'
  | 'assistance'
  | 'workflow_guidance'
  | 'other';

export type IntentTaxonomyEntry = {
  category: IntentCategory;
  requiresConfirmation: boolean;
  executable: boolean;
  description: string;
};

/** multiAgent SCREAMING_SNAKE intents (legacy internal categories). */
export type MultiAgentIntentName =
  | 'STORE_SETUP'
  | 'STORE_UPDATE'
  | 'STORE_QUERY'
  | 'MISSION_PLANNING'
  | 'GENERAL_QUERY'
  | 'SUPPORT';

/** Intent-First engine types (src/intent). */
export type IntentFirstTypeName =
  | 'greeting'
  | 'help'
  | 'capabilities'
  | 'question'
  | 'clarify'
  | 'create_store'
  | 'create_campaign'
  | 'setup_loyalty'
  | 'analytics'
  | 'manage_catalog';

const MULTI_AGENT_TO_UNIFIED: Record<MultiAgentIntentName, IntentType> = {
  STORE_SETUP: 'create_store',
  MISSION_PLANNING: 'create_store',
  STORE_UPDATE: 'update_store',
  STORE_QUERY: 'view_store',
  GENERAL_QUERY: 'general_chat',
  SUPPORT: 'get_help',
};

const INTENT_FIRST_TO_UNIFIED: Record<IntentFirstTypeName, IntentType> = {
  greeting: 'general_chat',
  help: 'get_help',
  capabilities: 'get_help',
  question: 'general_chat',
  clarify: 'clarification',
  create_store: 'create_store',
  create_campaign: 'create_campaign',
  setup_loyalty: 'setup_loyalty',
  analytics: 'view_analytics',
  manage_catalog: 'list_products',
};

function entry(
  category: IntentCategory,
  description: string,
  opts: { requiresConfirmation?: boolean; executable?: boolean } = {},
): IntentTaxonomyEntry {
  return {
    category,
    description,
    requiresConfirmation: opts.requiresConfirmation ?? false,
    executable: opts.executable ?? false,
  };
}

/**
 * Metadata for every canonical IntentType.
 * Single source of product meaning; adapters map other systems into these keys.
 */
export const INTENT_TAXONOMY: Record<IntentType, IntentTaxonomyEntry> = {
  create_store: entry('store_management', 'Create a new store', {
    requiresConfirmation: true,
    executable: true,
  }),
  update_store: entry('store_management', 'Update an existing store', {
    requiresConfirmation: true,
    executable: true,
  }),
  publish_store: entry('store_management', 'Publish a store', {
    requiresConfirmation: true,
    executable: true,
  }),
  view_store: entry('store_management', 'View store details', { executable: true }),
  delete_store: entry('store_management', 'Delete a store', {
    requiresConfirmation: true,
    executable: true,
  }),
  add_product: entry('product_management', 'Add a product', {
    requiresConfirmation: true,
    executable: true,
  }),
  update_product: entry('product_management', 'Update a product', {
    requiresConfirmation: true,
    executable: true,
  }),
  delete_product: entry('product_management', 'Delete a product', {
    requiresConfirmation: true,
    executable: true,
  }),
  list_products: entry('product_management', 'List products', { executable: true }),
  import_products: entry('product_management', 'Import products', {
    requiresConfirmation: true,
    executable: true,
  }),
  export_products: entry('product_management', 'Export products', { executable: true }),
  create_campaign: entry('campaign_management', 'Create a campaign', {
    requiresConfirmation: true,
    executable: true,
  }),
  update_campaign: entry('campaign_management', 'Update a campaign', {
    requiresConfirmation: true,
    executable: true,
  }),
  launch_campaign: entry('campaign_management', 'Launch a campaign', {
    requiresConfirmation: true,
    executable: true,
  }),
  view_campaign: entry('campaign_management', 'View a campaign', { executable: true }),
  delete_campaign: entry('campaign_management', 'Delete a campaign', {
    requiresConfirmation: true,
    executable: true,
  }),
  generate_graphic: entry('content', 'Generate a graphic', { executable: true }),
  update_hero_image: entry('content', 'Update hero image', { executable: true }),
  update_logo: entry('content', 'Update logo', { executable: true }),
  generate_promo_material: entry('content', 'Generate promo material', {
    executable: true,
  }),
  create_catalog: entry('catalog_management', 'Create a catalog', {
    requiresConfirmation: true,
    executable: true,
  }),
  update_catalog: entry('catalog_management', 'Update a catalog', {
    requiresConfirmation: true,
    executable: true,
  }),
  view_catalog: entry('catalog_management', 'View a catalog', { executable: true }),
  create_promotion: entry('promotion_management', 'Create a promotion', {
    requiresConfirmation: true,
    executable: true,
  }),
  update_promotion: entry('promotion_management', 'Update a promotion', {
    requiresConfirmation: true,
    executable: true,
  }),
  run_promotion: entry('promotion_management', 'Run a promotion', {
    requiresConfirmation: true,
    executable: true,
  }),
  upload_asset: entry('asset_management', 'Upload an asset', { executable: true }),
  analyze_asset: entry('asset_management', 'Analyze an asset', { executable: true }),
  manage_assets: entry('asset_management', 'Manage assets', { executable: true }),
  view_analytics: entry('analytics', 'View analytics', { executable: true }),
  generate_report: entry('analytics', 'Generate a report', { executable: true }),
  export_data: entry('analytics', 'Export data', { executable: true }),
  setup_loyalty: entry('loyalty', 'Set up loyalty program', {
    requiresConfirmation: true,
    executable: true,
  }),
  generate_content: entry('content', 'Generate content', { executable: true }),
  edit_content: entry('content', 'Edit content', { executable: true }),
  review_content: entry('content', 'Review content', { executable: false }),
  search: entry('discovery', 'Search', { executable: true }),
  browse: entry('discovery', 'Browse', { executable: false }),
  get_help: entry('assistance', 'Get help', { executable: false }),
  general_chat: entry('assistance', 'General chat / guidance', { executable: false }),
  clarification: entry('assistance', 'Ask for clarification', { executable: false }),
  unknown: entry('other', 'Unknown intent', { executable: false }),
  guide_to_sign_in: entry('workflow_guidance', 'Guide user to sign in', {
    executable: false,
  }),
  create_store_first: entry('workflow_guidance', 'Require store creation first', {
    executable: false,
  }),
  select_store_first: entry('workflow_guidance', 'Require store selection first', {
    executable: false,
  }),
  complete_workflow: entry('workflow_guidance', 'Complete an active workflow', {
    executable: true,
  }),
};

export function isKnownIntentType(value: string): value is IntentType {
  return (INTENT_TYPE_LIST as readonly string[]).includes(value);
}

/** Normalize LLM/user strings; unknown → general_chat (production llmReasoner contract). */
export function normalizeIntentType(raw: unknown): IntentType {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (isKnownIntentType(value)) return value;
  return 'general_chat';
}

export function fromMultiAgentIntent(intent: MultiAgentIntentName | string): IntentType {
  const key = String(intent || '').trim().toUpperCase() as MultiAgentIntentName;
  return MULTI_AGENT_TO_UNIFIED[key] ?? 'general_chat';
}

export function toMultiAgentIntent(intent: IntentType): MultiAgentIntentName {
  switch (intent) {
    case 'create_store':
      return 'STORE_SETUP';
    case 'update_store':
      return 'STORE_UPDATE';
    case 'view_store':
      return 'STORE_QUERY';
    case 'get_help':
      return 'SUPPORT';
    default:
      return 'GENERAL_QUERY';
  }
}

export function fromIntentFirstType(intent: IntentFirstTypeName | string): IntentType {
  const key = String(intent || '').trim() as IntentFirstTypeName;
  return INTENT_FIRST_TO_UNIFIED[key] ?? normalizeIntentType(key);
}

/** Prompt-friendly list for classifiers / reasoners. */
export function intentTypePromptList(): string {
  return INTENT_TYPE_LIST.join(' | ');
}
