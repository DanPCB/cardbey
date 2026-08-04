/**
 * Intent Reasoning Engine — main entry point.
 *
 * Re-exports types, guards, constants, and utilities for consumers.
 */

export type {
  ConfidenceFactor,
  ConfidenceFactorSource,
  ConfidenceProgressionPoint,
  GuestGuidance,
  GuestSignInFlow,
  IntentActionType,
  IntentContextSource,
  IntentFeedback,
  IntentFeedbackSource,
  IntentReasonerConfig,
  IntentReasoningMetadata,
  IntentReasoningResult,
  IntentType,
  LegacyClassificationCompat,
  ParsedAttachment,
  ParsedEntity,
  ParsedEntityType,
  ParsedInput,
  ParsedInputSourceType,
  ReasoningStep,
  ReasoningTrace,
  SuggestedAction,
  UserBlocker,
  UserBlockerType,
  UserConstraints,
  UserState,
  WorkflowType,
} from './intentTypes.js';

export {
  isConfidenceFactor,
  isGuestGuidance,
  isIntentResult,
  isParsedInput,
  isReasoningTrace,
  isSuggestedAction,
  isUserState,
  isValidIntentActionType,
  isValidIntentType,
} from './typeGuards.js';

export {
  CONFIDENCE_LEVELS,
  DEFAULT_REASONER_CONFIG,
  GUEST_GUIDANCE_DEFAULTS,
  INTENT_ACTION_TYPE_LIST,
  INTENT_DISPLAY_NAMES,
  INTENT_REASONER_VERSION,
  INTENT_TYPE_LIST,
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
} from './intentTaxonomy.js';

export { IntentReasoner } from './intentReasoner.js';
export { IntentIntegration, getIntentIntegration, resetIntentIntegrationForTests } from './intentIntegration.js';

export {
  createConfidenceFactor,
  createReasoningResult,
  getActionDisplayName,
  getConfidenceLevel,
  getIntentDescription,
  getIntentDisplayName,
  getSuggestedActionById,
  isSuccessfulReasoning,
  requiresUserIntervention,
} from './utils.js';
