// apps/core/cardbey-core/src/lib/intelligence/types.ts

/**
 * Shared types for Cardbey Intelligence Foundation
 * Layers 1-5 contracts - all serializable for API transport
 */

// ============================================
// Layer 1: Unified Context
// ============================================

export type ActorType = 'guest' | 'consumer' | 'store_owner' | 'admin';
export type Surface = 
  | 'global_frontpage'
  | 'business_card'
  | 'business_space'
  | 'performer_console'
  | 'discover_rail'
  | 'store_preview';

export interface UnifiedContextInput {
  route: string;
  auth: {
    userId: string | null;
    role: ActorType;
    displayName?: string;
  };
  session: {
    pilSessionId: string;
    eventWindowMs?: number;
  };
  entity?: {
    type: 'store' | 'offer' | 'content' | 'draft' | 'feed_artifact';
    id: string;
    name?: string;
  };
  overrides?: Partial<{
    surface: Surface;
    storeId: string;
  }>;
}

export interface BusinessMemorySummary {
  learnedSignals: string[];
  recentActions: Array<{ type: string; timestamp: string; outcome?: string }>;
  observations: Array<{ kind: string; confidence: number; recordedAt: string }>;
}

export interface SuitcaseHighlight {
  id: string;
  sourceType: string;
  title: string;
  summary: string | null;
  createdAt: string;
}

export interface UserMemory {
  preferences: string[];
  recentVisits: string[];
  savedItems: string[];
}

export interface SessionSignals {
  learnedSignals: string[];
  recentTypes: string[];
  sessionId: string | null;
}

export interface UnifiedMemoryBundle {
  business: BusinessMemorySummary | null;
  suitcase: SuitcaseHighlight[];
  user: UserMemory | null;
  session: SessionSignals;
  meta: {
    fetchedAt: string;
    sources: string[];
    partial: boolean;
  };
}

export interface BusinessAwarenessSnapshot {
  healthScore: number;
  profileComplete: boolean;
  hasActivePromotion: boolean;
  hasHeroMedia: boolean;
  catalogItemCount: number;
  recentVisitors: number;
  lastActivityAt: string | null;
}

export interface PilActivityContext {
  frictionSignals: string[];
  emotionalTone?: 'positive' | 'neutral' | 'frustrated';
  lastInteractionAt: number;
}

export interface VisitorSessionProfile {
  entryPoint: string;
  timeOnSite: number;
  pagesViewed: string[];
  returnCount: number;
}

export interface UnifiedContext {
  actor: {
    type: ActorType;
    id: string | null;
    displayName: string | null;
  };
  surface: Surface;
  entity: {
    type: string;
    id: string | null;
    name: string | null;
  };
  memory: {
    business: BusinessMemorySummary | null;
    suitcase: SuitcaseHighlight[];
    session: SessionSignals;
    user: UserMemory | null;
  };
  state: {
    awareness: BusinessAwarenessSnapshot | null;
    activity: PilActivityContext;
    visitor: VisitorSessionProfile | null;
  };
  tools: PerformerToolId[];
  actions: ActionCatalogEntry[];
  constraints: string[];
  trace: {
    builtAt: string;
    sources: string[];
  };
}

// ============================================
// Layer 2: Assessment
// ============================================

export interface AssessmentFact {
  id: string;
  label: string;
  value: string | number;
  source: 'awareness' | 'memory' | 'suitcase' | 'session' | 'observation';
  sourceRef: string;
}

export interface AssessmentIssue {
  id: string;
  title: string;
  severity: 'critical' | 'attention' | 'info';
  sourceRef: string;
}

export interface AssessmentSignal {
  kind: string;
  confidence: number;
  evidence: string[];
  sourceRef: string;
}

export interface AssessmentReadiness {
  canSuggest: boolean;
  blockers: string[];
}

export interface AssessmentScores {
  healthScore?: number;
  intentConfidence?: number;
  opportunityConfidence?: number;
}

export interface Assessment {
  facts: AssessmentFact[];
  issues: AssessmentIssue[];
  signals: AssessmentSignal[];
  readiness: AssessmentReadiness;
  scores: AssessmentScores;
}

// ============================================
// Layer 3: Suggestions
// ============================================

export type PerformerToolId =
  | 'explore_feed'
  | 'open_store_space'
  | 'view_offers'
  | 'view_show'
  | 'ask_performer'
  | 'create_space'
  | 'create_offer'
  | 'prepare_opportunity'
  | 'review_briefing'
  | 'open_suitcase'
  | 'compare_packages'
  | 'save_for_later'
  | 'show_briefing'
  | 'remind_later'
  | 'dismiss'
  | 'launch_campaign'
  | 'generate_video'
  | 'complete_profile'
  | 'open_offer';

export type ExecutionLane = 'navigation' | 'performer_prefill' | 'session_only';

export interface ActionCatalogEntry {
  id: PerformerToolId;
  label: string;
  executionLane: ExecutionLane;
  proposedAction: string; // safeExecutionGovernance key
  performerToolName?: string;
  opportunityActionType?: string;
  conciergeCtaKind?: string;
  navigateTo?: string;
  scrollTarget?: string;
  handler?: string;
  autoSubmit?: boolean;
  requiresConfirmation?: boolean; // computed at runtime, not stored
  resolveProposedAction?: (opportunity?: any) => string;
  resolvePerformerToolName?: (opportunity?: any) => string | undefined;
}

export interface Suggestion {
  id: string;
  tool: PerformerToolId;
  label: string;
  priority: number;
  opportunityId?: string;
  target: {
    type: string;
    id: string | null;
  };
  evidence: string[];
  readiness: 'ready' | 'needs_review' | 'blocked';
  governance: {
    requiresConfirmation: boolean;
    proposedAction: string;
    autoSubmit: false;
  };
  trace: {
    reasonCode: string;
    sourcePipeline: string;
  };
  dynamicPayload?: any; // For prepare_opportunity with opportunity data
}

// ============================================
// Layer 4: Expression
// ============================================

export interface ExpressionInput {
  surface: 'pil' | 'briefing' | 'smart_object' | 'discover';
  context: UnifiedContext;
  assessment: Assessment;
  suggestions: Suggestion[];
  options?: {
    maxTokens?: number;
    temperature?: number;
  };
}

export interface ExpressionOutput {
  title: string;
  message: string;
  primarySuggestionId: string;
  secondarySuggestionIds: string[];
  keyFacts?: string[];
  memoryReference?: string;
}

export interface FallbackExpressionOutput extends ExpressionOutput {
  fallback: true;
}

export interface ExpressionErrorResponse {
  error: string;
  code: 'invalid_input' | 'llm_timeout' | 'llm_rate_limited' | 'validation_failed';
}

// ============================================
// Layer 4: Component Props (UI)
// ============================================

export interface PILExpressionProps {
  title: string;
  message: string;
  actions: Array<{
    suggestionId: string;
    label: string;
  }>;
  internal?: {
    trace: object;
  };
}

export interface BriefingExpressionProps {
  performersRead: string;
  keyFacts: string[];
  suggestedNext: {
    suggestionId: string;
    label: string;
    whyThis?: string;
  };
  controls: Array<'prepare' | 'remind_later' | 'dismiss' | 'open_suitcase'>;
}

export interface SmartObjectExpressionProps {
  headline: string;
  body: string;
  primaryAction: {
    suggestionId: string;
    label: string;
  };
}

export interface DiscoverExpressionProps {
  title: string;
  message: string;
  actions: Array<{
    suggestionId: string;
    label: string;
  }>;
}

// ============================================
// Execution
// ============================================

export interface ExecutionResult {
  status: 'success' | 'pending_confirmation' | 'blocked' | 'error';
  step?: string;
  message?: string;
  requiresConfirmation?: boolean;
}