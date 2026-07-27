/**
 * Intent-First Engine — core types.
 * Classification → Context → Execution pipeline contract.
 */

export type IntentType =
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

export interface Intent {
  type: IntentType;
  requiresBusiness: boolean;
  confidence: number;
  response?: string;
  entities?: Record<string, unknown>;
  shouldExecute: boolean;
}

export type ContextStatus = 'not_required' | 'ready' | 'needs_store_creation' | 'needs_store_picker';

export interface ContextResult {
  status: ContextStatus;
  storeId?: string | null;
  storeCount: number;
  stores?: Array<Record<string, unknown>>;
  message?: string;
  lockedTool?: string;
}

export type ExecutionAction =
  | 'chat'
  | 'clarify'
  | 'create_store'
  | 'campaign_creation'
  | 'analytics'
  | 'store_picker'
  | 'proactive_plan';

export interface ExecutionResult {
  action: ExecutionAction;
  response?: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  clarifyType?: string;
  clarifyOptions?: Array<Record<string, unknown>>;
  storeCandidates?: Array<Record<string, unknown>>;
  pendingIntent?: Record<string, unknown>;
  executionPath?: string;
  storeId?: string | null;
  /** Tool-calling trace when DeepSeek live-data enrichment ran. */
  toolCalls?: Array<{
    id: string;
    name: string;
    status: string;
    parameters?: Record<string, unknown>;
    result?: { ok: boolean; data?: unknown; error?: string; summary?: string };
    durationMs?: number;
  }>;
  thinkingText?: string;
}

export interface IntentResult {
  intent: Intent;
  context: ContextResult;
  execution: ExecutionResult;
  metrics: {
    classificationTime: number;
    contextTime: number;
    executionTime: number;
    totalTime: number;
    confidence: number;
  };
}

export interface IntentEngineInput {
  message: string;
  userId?: string | null;
  /** Authenticated account owner — used for business table lookup (not guest actor id). */
  ownerUserId?: string | null;
  sessionId?: string | null;
  activeStoreId?: string | null;
  /** Explicit entry points only — not used to override classification. */
  primaryModeHint?: string | null;
  /** Explicit store creation form submit. */
  storeCreateForm?: Record<string, unknown> | null;
  action?: string | null;
}

export interface IntentShadowComparison {
  shadowIntent: IntentType;
  shadowAction: ExecutionAction;
  legacyAction?: string | null;
  legacyTool?: string | null;
  agree: boolean;
  divergences: string[];
}
