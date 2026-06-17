/**
 * Unified Memory Types — single source of truth for memory facade contracts.
 */

export type MemoryActorType = 'guest' | 'consumer' | 'store_owner' | 'admin';

export interface MemoryContext {
  actor: {
    type: MemoryActorType;
    id: string | null;
    userId?: string | null;
    email?: string;
  };
  storeId: string | null;
  sessionId: string | null;
  missionId: string | null;
  sessionHints?: {
    recentEventTypes?: string[];
  };
  ownerId?: string | null;
}

export interface BusinessMemory {
  recentObservations: Array<Record<string, unknown>>;
  recentOpportunities: Array<Record<string, unknown>>;
  recentDecisions: Array<Record<string, unknown>>;
  recentActions: Array<Record<string, unknown>>;
  recentOutcomes: Array<Record<string, unknown>>;
  learnedSignals: string[];
  skipped?: boolean;
}

export interface SuitcaseItem {
  id: string;
  sourceType: string;
  title: string;
  summary: string | null;
  description: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface UserMemory {
  preferences: Record<string, unknown>;
  recentVisits: string[];
  savedItems: string[];
  abandonedTasks: string[];
  completedTasks: string[];
  visitCount?: number;
  lastAction?: string;
  lastActionAt?: string;
}

export interface SessionMemory {
  events: Array<{
    type: string;
    timestamp: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }>;
  learnedSignals: string[];
  recentTypes: string[];
  sessionId: string | null;
  startedAt?: string;
  source?: string;
}

export interface MissionContextMemory {
  missionId: string;
  status: string;
  type: string;
  steps: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  blackboard: Record<string, unknown>;
  activeSummary?: string | null;
  keyFacts?: string[];
}

export interface UnifiedMemoryBundle {
  ok?: boolean;
  business: BusinessMemory | null;
  suitcase: SuitcaseItem[];
  user: UserMemory | null;
  session: SessionMemory | null;
  mission: MissionContextMemory | null;
  activeSummary?: string | null;
  keyFacts?: string[];
  meta: {
    fetchedAt: string;
    sources: string[];
    partial: boolean;
    fetchDurationMs: number;
    cacheHit?: boolean;
    suitcaseFetchLimit?: number;
    suitcaseHighlightCap?: number;
  };
}
