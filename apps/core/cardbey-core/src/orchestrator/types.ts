/**
 * Orchestrator Core Types
 * TypeScript interfaces for the AI orchestration system
 */

/**
 * OrchestratorContext - Rich context for decision-making
 */
export interface OrchestratorContext {
  /** User ID making the request */
  userId: string;
  /** Store/Business ID (if applicable) */
  storeId?: string;
  /** Image URL for vision-based context */
  imageUrl?: string;
  /** Text input for text-based context */
  text?: string;
  /** Enriched metadata from context parsers */
  metadata?: Record<string, unknown>;
  /** Scene classification result */
  scene?: SceneClassification;
  /** User session data */
  session?: UserSessionData;
  /** Store profile data */
  storeProfile?: StoreProfileData;
  /** Timestamp when context was created */
  timestamp: Date;
}

/**
 * SceneClassification - Classified scene/context type
 */
export interface SceneClassification {
  /** Primary scene type */
  type: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional tags/categories */
  tags?: string[];
}

/**
 * UserSessionData - User session information
 */
export interface UserSessionData {
  /** Session ID */
  sessionId: string;
  /** Recent actions/interactions */
  recentActions?: string[];
  /** User preferences */
  preferences?: Record<string, unknown>;
}

/**
 * StoreProfileData - Store/business profile information
 */
export interface StoreProfileData {
  /** Store ID */
  storeId: string;
  /** Store name */
  name: string;
  /** Store type/category */
  type?: string;
  /** Store-specific settings */
  settings?: Record<string, unknown>;
}

/**
 * OrchestratorIntent - Detected user intent
 */
export interface OrchestratorIntent {
  /** Intent type (e.g., "create_flyer", "update_menu", "schedule_campaign") */
  type: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Intent category (business, workflow, etc.) */
  category: 'business' | 'workflow' | 'content' | 'other';
  /** Extracted parameters from intent */
  parameters?: Record<string, unknown>;
  /** Related intents (if multiple detected) */
  relatedIntents?: OrchestratorIntent[];
}

/**
 * PlanStep - Single step in an execution plan
 */
export interface PlanStep {
  /** Unique step ID */
  id: string;
  /** Step type/action */
  type: string;
  /** Skill ID to execute */
  skillId: string;
  /** Step parameters */
  parameters?: Record<string, unknown>;
  /** Dependencies (other step IDs that must complete first) */
  dependencies?: string[];
  /** Retry policy for this step */
  retryPolicy?: RetryPolicy;
  /** Estimated duration (milliseconds) */
  estimatedDuration?: number;
}

/**
 * OrchestratorPlan - Complete execution plan
 */
export interface OrchestratorPlan {
  /** Plan ID */
  id: string;
  /** Plan steps in execution order */
  steps: PlanStep[];
  /** Deduplicated list of tool names the planner intends to use (for tool-completeness reward) */
  expectedTools?: string[];
  /** Plan metadata */
  metadata?: {
    /** Total estimated duration */
    estimatedDuration?: number;
    /** Plan version */
    version?: string;
    /** Plan tags */
    tags?: string[];
  };
  /** Validation results */
  validation?: {
    /** Is plan valid */
    valid: boolean;
    /** Validation errors (if any) */
    errors?: string[];
    /** Validation warnings */
    warnings?: string[];
  };
}

/**
 * SkillDefinition - Definition of an executable skill
 */
export interface SkillDefinition {
  /** Unique skill ID */
  id: string;
  /** Skill name */
  name: string;
  /** Skill description */
  description?: string;
  /** Skill version */
  version: string;
  /** Skill tags for categorization */
  tags: string[];
  /** Required input parameters */
  inputSchema?: Record<string, unknown>;
  /** Expected output schema */
  outputSchema?: Record<string, unknown>;
  /** Skill handler function */
  handler?: (params: Record<string, unknown>) => Promise<unknown>;
  /** Skill metadata */
  metadata?: Record<string, unknown>;
}

/**
 * AgentRequest - Request to an AI agent
 */
export interface AgentRequest {
  /** Request ID */
  id: string;
  /** Agent type/name */
  agentType: string;
  /** Request payload */
  payload: Record<string, unknown>;
  /** Request context */
  context?: OrchestratorContext;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * AgentResponse - Response from an AI agent
 */
export interface AgentResponse {
  /** Response ID (matches request ID) */
  id: string;
  /** Success status */
  success: boolean;
  /** Response data */
  data?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Response metadata */
  metadata?: Record<string, unknown>;
  /** Processing time (milliseconds) */
  processingTime?: number;
}

/**
 * RetryPolicy - Retry configuration for failed operations
 */
export interface RetryPolicy {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay before first retry (milliseconds) */
  initialDelay: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Maximum delay between retries (milliseconds) */
  maxDelay?: number;
}

/**
 * OrchestratorRunRequest - Request to run orchestrator
 */
export interface OrchestratorRunRequest {
  /** Image URL (optional) */
  imageUrl?: string;
  /** Text input (optional) */
  text?: string;
  /** Store ID (required) */
  storeId: string;
  /** User ID (required) */
  userId: string;
  /** Entry point (optional, for specific workflows) */
  entryPoint?: string;
}

/**
 * OrchestratorRunResponse - Response from orchestrator run
 */
export interface OrchestratorRunResponse {
  /** Success status */
  ok: boolean;
  /** Response message */
  message: string;
  /** Execution plan (if generated) */
  plan?: OrchestratorPlan;
  /** Execution result (if completed) */
  result?: unknown;
  /** Error information (if failed) */
  error?: string;
}

/**
 * OrchestratorRunResult - Complete orchestrator execution result
 */
export interface OrchestratorRunResult {
  /** Orchestrator context used for execution */
  context: OrchestratorContext;
  /** Detected user intent */
  intent: OrchestratorIntent;
  /** Generated execution plan */
  plan: OrchestratorPlan;
  /** Creative proposals from Creative Agent (optional) */
  creativeProposals?: import('../agents/creative/types').CreativeProposal[];
  // TODO: later we can add: executionResult, diagnostics, etc.
}

/**
 * Canvas Node - Individual element in canvas
 */
export interface CanvasNode {
  id: string;
  type: string;
  [key: string]: unknown;
}

/**
 * Canvas Settings - Canvas configuration
 */
export interface CanvasSettings {
  width?: number;
  height?: number;
  backgroundColor?: string;
  backgroundImage?: string;
  [key: string]: unknown;
}

/**
 * Canvas State - Complete canvas state structure
 * Supports both 'nodes' and 'elements' formats for compatibility
 */
export interface CanvasState {
  /** Canvas nodes/elements (preferred: nodes) */
  nodes?: CanvasNode[];
  /** Canvas elements (legacy format, supported for backward compatibility) */
  elements?: CanvasNode[];
  /** Canvas settings */
  settings: CanvasSettings;
  [key: string]: unknown;
}

/**
 * SAM-3 Design Task Request
 * Request for SAM-3 orchestrator to process Content Studio design tasks
 */
export interface Sam3DesignTaskRequest {
  /** Entry point identifier - must be "content_studio" */
  entryPoint: 'content_studio';
  /** Task mode - what type of design task to perform */
  mode: 'new_banner' | 'improve_layout' | 'fix_copy' | 'video_storyboard' | 'product_cutout';
  /** Target type - what the task targets */
  target: 'image' | 'layout' | 'video';
  /** Current canvas JSON state (optional) */
  canvasState?: CanvasState;
  /** Selected element(s) (optional) */
  selection?: CanvasNode[] | null;
  /** User's design request/prompt */
  userPrompt: string;
  /** Image URL (for product_cutout mode) */
  imageUrl?: string;
  /** Image buffer (base64 encoded, for product_cutout mode) */
  imageBuffer?: string;
}

/**
 * SAM-3 Design Task Result
 * Result from SAM-3 orchestrator design task processing
 */
export interface Sam3DesignTaskResult {
  /** Updated canvas state or patch (optional) */
  updatedCanvas?: CanvasState;
  /** Review notes and suggestions (optional, deprecated - no longer returned) */
  reviewNotes?: string[];
  /** Video storyboard (only when target === "video") */
  videoStoryboard?: unknown;
  /** Product cutout data (only when mode === "product_cutout") */
  cutoutUrl?: string;
  previewUrl?: string;
  mask?: unknown;
  refinedBox?: { x: number; y: number; width: number; height: number };
  score?: number;
  warning?: string;
}

/**
 * SAM-3 Design Task Response
 * Complete response from design-task endpoint
 */
export interface Sam3DesignTaskResponse {
  /** Success status */
  ok: boolean;
  /** Task identifier for tracking */
  taskId: string;
  /** Design task result */
  result: Sam3DesignTaskResult;
  /** Error message (if ok === false) */
  error?: string;
  /** Error message for user display (if ok === false) */
  message?: string;
}

