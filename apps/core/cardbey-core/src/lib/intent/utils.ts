/**
 * Utilities for the Intent Reasoning Engine.
 */

import type {
  ConfidenceFactor,
  ConfidenceFactorSource,
  IntentActionType,
  IntentReasoningMetadata,
  IntentReasoningResult,
  IntentType,
  SuggestedAction,
} from './intentTypes.js';
import { CONFIDENCE_LEVELS, INTENT_DISPLAY_NAMES } from './constants.js';

const INTENT_DESCRIPTIONS: Record<IntentType, string> = {
  create_store: 'Create a new store',
  update_store: 'Update store details',
  publish_store: 'Publish your store',
  view_store: 'View store details',
  delete_store: 'Delete a store',
  add_product: 'Add a product to your store',
  update_product: 'Update a product',
  delete_product: 'Delete a product',
  list_products: 'List all products',
  import_products: 'Import products from a file',
  export_products: 'Export products to a file',
  create_campaign: 'Create a new campaign',
  update_campaign: 'Update a campaign',
  launch_campaign: 'Launch a campaign',
  view_campaign: 'View campaign details',
  delete_campaign: 'Delete a campaign',
  generate_graphic: 'Generate a graphic',
  update_hero_image: 'Update the hero image',
  update_logo: 'Update the logo',
  generate_promo_material: 'Generate promotional material',
  create_catalog: 'Create a product catalog',
  update_catalog: 'Update a catalog',
  view_catalog: 'View a catalog',
  create_promotion: 'Create a promotion',
  update_promotion: 'Update a promotion',
  run_promotion: 'Run a promotion',
  upload_asset: 'Upload an asset',
  analyze_asset: 'Analyze an asset',
  manage_assets: 'Manage assets',
  view_analytics: 'View analytics',
  setup_loyalty: 'Set up a loyalty program',
  generate_report: 'Generate a report',
  export_data: 'Export data',
  generate_content: 'Generate content',
  edit_content: 'Edit content',
  review_content: 'Review content',
  search: 'Search',
  browse: 'Browse',
  get_help: 'Get help',
  general_chat: 'General conversation',
  clarification: 'Clarification needed',
  unknown: 'Unknown intent',
  guide_to_sign_in: 'Sign in required',
  create_store_first: 'Create a store first',
  select_store_first: 'Select a store first',
  complete_workflow: 'Complete workflow',
};

const ACTION_DISPLAY_NAMES: Record<IntentActionType, string> = {
  execute_tool: 'Execute',
  guide_to_sign_in: 'Sign In',
  ask_clarification: 'Clarify',
  present_options: 'Choose Option',
  continue_workflow: 'Continue',
  start_new_workflow: 'Start New',
  show_help: 'Help',
  complete_workflow: 'Complete',
  cancel_workflow: 'Cancel',
  defer: 'Defer',
  no_action: 'No Action',
};

export function getIntentDisplayName(intent: IntentType): string {
  return INTENT_DISPLAY_NAMES[intent] ?? intent;
}

export function getIntentDescription(intent: IntentType): string {
  return INTENT_DESCRIPTIONS[intent] ?? 'Unknown intent';
}

export function getActionDisplayName(action: IntentActionType): string {
  return ACTION_DISPLAY_NAMES[action] ?? action;
}

export function getSuggestedActionById(
  actions: SuggestedAction[],
  id: string,
): SuggestedAction | undefined {
  return actions.find((a) => a.id === id);
}

export function getConfidenceLevel(
  confidence: number,
): 'high' | 'medium' | 'low' | 'very_low' {
  if (confidence >= CONFIDENCE_LEVELS.HIGH) return 'high';
  if (confidence >= CONFIDENCE_LEVELS.MEDIUM) return 'medium';
  if (confidence >= CONFIDENCE_LEVELS.LOW) return 'low';
  return 'very_low';
}

export function createConfidenceFactor(
  factor: string,
  contribution: number,
  description: string,
  source: ConfidenceFactorSource = 'rules',
): ConfidenceFactor {
  return { factor, contribution, description, source };
}

export function createReasoningResult(
  intent: IntentType,
  confidence: number,
  action: IntentActionType,
  reasoning: string[],
  metadata: Partial<IntentReasoningMetadata> = {},
): IntentReasoningResult {
  return {
    intent,
    confidence,
    reasoning,
    trace: null,
    action,
    tool: null,
    parameters: {},
    requiresClarification: false,
    clarificationPrompt: null,
    suggestedActions: [],
    guestGuidance: null,
    userState: null,
    parsedInput: null,
    metadata: {
      reasoningTimeMs: 0,
      contextUsed: [],
      sources: ['rules'],
      confidenceFactors: [],
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      ...metadata,
    },
  };
}

export function isSuccessfulReasoning(result: IntentReasoningResult): boolean {
  return result.confidence >= 0.7 && !result.requiresClarification;
}

export function requiresUserIntervention(result: IntentReasoningResult): boolean {
  return (
    result.requiresClarification ||
    result.action === 'ask_clarification' ||
    result.action === 'guide_to_sign_in' ||
    result.action === 'present_options'
  );
}
