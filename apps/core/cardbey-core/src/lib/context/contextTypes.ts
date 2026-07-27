/**
 * Context Engine — single source of truth for Performer session context.
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
  | 'unknown';

export type InteractionType =
  | 'text_input'
  | 'file_upload'
  | 'image_upload'
  | 'voice_input'
  | 'mission_created'
  | 'checkpoint_resolved'
  | 'mission_completed'
  | 'mission_failed'
  | 'user_feedback'
  | 'tool_execution';

export type IntentType = string;

export type Capability = string;

export interface NotificationPreferences {
  email?: boolean;
  push?: boolean;
  sms?: boolean;
  [key: string]: unknown;
}

export interface Interaction {
  id: string;
  timestamp: string;
  type: InteractionType;
  input: unknown;
  output: unknown;
  intent: IntentType | null;
  confidence: number | null;
  durationMs: number;
}

export interface CompletedAction {
  id: string;
  timestamp: string;
  type: string;
  tool: string;
  result: unknown;
  success: boolean;
}

export interface PendingCheckpoint {
  stepId: string;
  type: 'upload' | 'confirmation' | 'input' | 'selection';
  prompt: string;
  timestamp: string;
  options?: unknown[];
}

export interface UserPreferences {
  preferredWorkflowOrder: string[];
  skippedSteps: string[];
  language: string;
  notificationPreferences: NotificationPreferences;
  defaultAction: string | null;
  frequentlyUsedTools: string[];
}

export interface BehaviorPattern {
  pattern: string;
  frequency: number;
  lastObserved: string;
  confidence: number;
}

export interface InputContext {
  rawText: string;
  hasAttachment: boolean;
  hasImage: boolean;
  attachmentTypes: string[];
  extractedText: string | null;
  detectedType: string | null;
}

export interface ContextMetadata {
  createdAt: string;
  updatedAt: string;
  version: string;
  lastActivityAt: string;
  totalInteractions: number;
}

/**
 * Complete user context for Performer reasoning.
 */
export interface UserContext {
  sessionId: string;
  userId: string;
  currentWorkflow: WorkflowType | null;
  activeMissionId: string | null;
  currentStepId: string | null;
  activeStoreId: string | null;
  activeCampaignId: string | null;
  activeDraftId: string | null;
  interactions: Interaction[];
  completedActions: CompletedAction[];
  pendingCheckpoints: PendingCheckpoint[];
  preferences: UserPreferences;
  behaviorPatterns: BehaviorPattern[];
  systemCapabilities: Capability[];
  currentInputContext: InputContext | null;
  metadata: ContextMetadata;
}

/** Partial update applied to UserContext */
export type ContextUpdate = Partial<UserContext>;
