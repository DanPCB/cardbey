/**
 * Phase 2 — single import surface for the unified intent taxonomy.
 *
 * Canonical values are INTENT_TYPE_LIST / IntentType (create_store, …).
 * Named unifiedIntent.ts (not IntentTypes.ts) to avoid Windows case collision
 * with intentTypes.ts.
 */

export type { IntentType, IntentActionType } from './intentTypes.js';
export {
  INTENT_TYPE_LIST,
  INTENT_ACTION_TYPE_LIST,
  INTENT_DISPLAY_NAMES,
  WORKFLOW_TYPE_LIST,
} from './constants.js';
export {
  INTENT_TAXONOMY,
  fromIntentFirstType,
  fromMultiAgentIntent,
  intentTypePromptList,
  isKnownIntentType,
  normalizeIntentType,
  toMultiAgentIntent,
  type IntentCategory,
  type IntentFirstTypeName,
  type IntentTaxonomyEntry,
  type MultiAgentIntentName,
} from './intentTaxonomy.js';
