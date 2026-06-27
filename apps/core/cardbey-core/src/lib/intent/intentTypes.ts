/**
 * ============================================================
 * PHASE B.1 — INTENT REASONING TYPES
 * ============================================================
 *
 * Complete type system for the Intent Reasoning Engine.
 * All reasoning components must use these types as their contract.
 *
 * @see Phase A context types: `../context/contextTypes.ts`
 */

// ============================================================
// 1. CORE INTENT TYPES
// ============================================================

/** Primary intent identified by the reasoning engine (user's ultimate goal). */
export type IntentType =
  // Store-related intents
  | 'create_store'
  | 'update_store'
  | 'publish_store'
  | 'view_store'
  | 'delete_store'
  // Product-related intents
  | 'add_product'
  | 'update_product'
  | 'delete_product'
  | 'list_products'
  | 'import_products'
  | 'export_products'
  // Campaign-related intents
  | 'create_campaign'
  | 'update_campaign'
  | 'launch_campaign'
  | 'view_campaign'
  | 'delete_campaign'
  // Graphic / design intents
  | 'generate_graphic'
  | 'update_hero_image'
  | 'update_logo'
  | 'generate_promo_material'
  // Catalog intents
  | 'create_catalog'
  | 'update_catalog'
  | 'view_catalog'
  // Promotion intents
  | 'create_promotion'
  | 'update_promotion'
  | 'run_promotion'
  // Asset intents
  | 'upload_asset'
  | 'analyze_asset'
  | 'manage_assets'
  // Analytics intents
  | 'view_analytics'
  | 'setup_loyalty'
  | 'generate_report'
  | 'export_data'
  // Content intents
  | 'generate_content'
  | 'edit_content'
  | 'review_content'
  // Navigation / discovery intents
  | 'search'
  | 'browse'
  | 'get_help'
  // General intents
  | 'general_chat'
  | 'clarification'
  | 'unknown'
  // Workflow guidance intents
  | 'guide_to_sign_in'
  | 'create_store_first'
  | 'select_store_first'
  | 'complete_workflow';

// ============================================================
// 2. INTENT ACTION TYPES
// ============================================================

/** Action the system should take based on the reasoned intent. */
export type IntentActionType =
  | 'execute_tool'
  | 'guide_to_sign_in'
  | 'ask_clarification'
  | 'present_options'
  | 'continue_workflow'
  | 'start_new_workflow'
  | 'show_help'
  | 'complete_workflow'
  | 'cancel_workflow'
  | 'defer'
  | 'no_action';

// ============================================================
// 3. CONFIDENCE & REASONING
// ============================================================

export type ConfidenceFactorSource = 'context' | 'input' | 'rules' | 'ml' | 'fallback';

/** Factor that contributed to the confidence score (transparency / debugging). */
export interface ConfidenceFactor {
  factor: string;
  /** Contribution to confidence (0.0–1.0). */
  contribution: number;
  description: string;
  source: ConfidenceFactorSource;
}

/** Complete reasoning trace for a single intent reasoning operation. */
export interface ReasoningTrace {
  reasoningId: string;
  timestamp: string;
  durationMs: number;
  steps: ReasoningStep[];
  decision: string;
  confidenceProgression: ConfidenceProgressionPoint[];
}

/** A single step in the reasoning process. */
export interface ReasoningStep {
  id: string;
  action: string;
  observation: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/** A point in the confidence progression. */
export interface ConfidenceProgressionPoint {
  stepId: string;
  confidence: number;
  reason: string;
}

// ============================================================
// 4. SUGGESTED ACTIONS
// ============================================================

/** Action suggested to the user. */
export interface SuggestedAction {
  id: string;
  label: string;
  description: string;
  action: IntentActionType;
  icon?: string;
  priority?: number;
  tool?: string;
  parameters?: Record<string, unknown>;
  note?: string;
}

// ============================================================
// 5. GUEST GUIDANCE
// ============================================================

export type GuestSignInFlow = 'email' | 'google' | 'apple' | 'guest_to_user';

/** Guest-specific guidance (isolated from main intent result). */
export interface GuestGuidance {
  requiresSignIn: boolean;
  message: string;
  alternativeAction: string;
  whatWillBeLost?: string;
  whatWillBeGained?: string;
  signInFlow?: GuestSignInFlow;
}

// ============================================================
// 6. INPUT PARSING
// ============================================================

export type ParsedEntityType =
  | 'store'
  | 'product'
  | 'campaign'
  | 'date'
  | 'number'
  | 'currency'
  | 'text'
  | 'unknown';

export type ParsedInputSourceType = 'text' | 'voice' | 'file' | 'image' | 'combined';

/** Structured user input after parsing. */
export interface ParsedInput {
  rawText: string;
  normalizedText: string;
  hasAttachment: boolean;
  hasImage: boolean;
  extractedText: string | null;
  attachments: ParsedAttachment[];
  entities: ParsedEntity[];
  language?: string;
  sourceType?: ParsedInputSourceType;
}

export interface ParsedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedEntity {
  type: ParsedEntityType;
  value: string;
  confidence: number;
  position?: { start: number; end: number };
}

// ============================================================
// 7. CONTEXT EVALUATION
// ============================================================

/**
 * Known workflow types (extends Phase A `WorkflowType` with `asset_management`).
 * @see ../context/contextTypes.ts
 */
export type WorkflowType =
  | 'store_creation'
  | 'campaign_creation'
  | 'graphic_generation'
  | 'product_management'
  | 'catalog_creation'
  | 'promotion_creation'
  | 'analytics'
  | 'content_generation'
  | 'asset_management'
  | 'unknown';

export type UserBlockerType =
  | 'sign_in_required'
  | 'no_store'
  | 'no_permission'
  | 'workflow_blocked'
  | 'other';

/** What is blocking the user from performing an action. */
export interface UserBlocker {
  type: UserBlockerType;
  description: string;
  resolution: string;
  resolutionAction: IntentActionType;
}

/** Constraints on the user (guest, permissions, etc.). */
export interface UserConstraints {
  isGuest: boolean;
  canPerformAction: boolean;
  blockers: UserBlocker[];
}

/**
 * Evaluation of the user's current state (derived from Context Engine).
 */
export interface UserState {
  hasStore: boolean;
  storeId: string | null;
  draftId: string | null;
  isGuest: boolean;
  hasDraftStore: boolean;
  hasPermanentStore: boolean;
  isInWorkflow: boolean;
  workflowType: WorkflowType | null;
  missionId: string | null;
  recentInteractions: string[];
  inferredGoal: string | null;
  constraints: UserConstraints;
  description: string;
}

// ============================================================
// 8. INTENT REASONING RESULT (MAIN OUTPUT)
// ============================================================

export type IntentContextSource =
  | 'session'
  | 'store'
  | 'campaign'
  | 'interactions'
  | 'preferences'
  | 'behavior';

/** Metadata about the reasoning operation. */
export interface IntentReasoningMetadata {
  reasoningTimeMs: number;
  contextUsed: IntentContextSource[];
  sources: ConfidenceFactorSource[];
  confidenceFactors: ConfidenceFactor[];
  version: string;
  environment: string;
}

/**
 * Complete result of the Intent Reasoning Engine.
 * Primary output of Phase B — replaces classification-based results over time.
 */
export interface IntentReasoningResult {
  intent: IntentType;
  confidence: number;
  reasoning: string[];
  trace: ReasoningTrace | null;
  action: IntentActionType;
  tool: string | null;
  parameters: Record<string, unknown>;
  requiresClarification: boolean;
  clarificationPrompt: string | null;
  suggestedActions: SuggestedAction[];
  guestGuidance: GuestGuidance | null;
  userState: UserState | null;
  parsedInput: ParsedInput | null;
  metadata: IntentReasoningMetadata;
}

// ============================================================
// 9. INTENT REASONER CONFIGURATION
// ============================================================

/** Configuration for the Intent Reasoner. */
export interface IntentReasonerConfig {
  minConfidenceThreshold: number;
  minClarificationThreshold: number;
  maxReasoningTimeMs: number;
  guestAwareEnabled: boolean;
  learningEnabled: boolean;
  traceEnabled: boolean;
  maxInteractions: number;
  defaultAction: IntentActionType;
  supportedLanguages: string[];
}

// ============================================================
// 10. FEEDBACK & LEARNING
// ============================================================

export type IntentFeedbackSource = 'user' | 'auto' | 'admin';

/** Feedback on reasoning accuracy (learning loop). */
export interface IntentFeedback {
  id: string;
  reasoningId: string;
  wasCorrect: boolean;
  intendedIntent?: IntentType;
  feedbackText?: string;
  rating?: number;
  timestamp: string;
  source: IntentFeedbackSource;
}

// ============================================================
// 11. COMPATIBILITY (Migration from Classification)
// ============================================================

/** Legacy classification result for backward compatibility during migration. */
export interface LegacyClassificationCompat {
  legacy: unknown;
  migrationSuggestion: string;
  isDropInCompatible: boolean;
}
