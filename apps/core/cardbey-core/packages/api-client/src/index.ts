/**
 * Cardbey API Client
 * TypeScript types and functions for calling Cardbey Core API
 */

// ============================================================================
// RAG (Retrieval-Augmented Generation) Types
// ============================================================================

export interface RagAskRequest {
  question: string;
  scope?: string;
}

export interface RagAskSource {
  id: string;
  sourcePath: string;
  chunkIndex: number;
  snippet: string;
}

export interface RagAskResponse {
  ok: boolean;
  answer: string;
  scope?: string;
  sources: RagAskSource[];
}

// ============================================================================
// RAG API Client Function
// ============================================================================

/**
 * Ask a question to the RAG system
 * 
 * @param baseUrl - Base URL of the Cardbey Core API (e.g., "http://localhost:3001")
 * @param request - Question and optional scope filter
 * @param options - Optional fetch options (e.g., headers for auth)
 * @returns Promise with the RAG answer and sources
 * 
 * @example
 * ```typescript
 * const response = await ragAsk('http://localhost:3001', {
 *   question: 'How do I pair a device?',
 *   scope: 'device_engine'
 * });
 * console.log(response.answer);
 * ```
 */
export async function ragAsk(
  baseUrl: string,
  request: RagAskRequest,
  options?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
): Promise<RagAskResponse> {
  const url = `${baseUrl}/api/rag/ask`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: JSON.stringify(request),
    signal: options?.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// Orchestrator Types
// ============================================================================

export type OrchestratorEntryPoint =
  | "device_health_check"
  | "playlist_assignment_audit"
  | "device_maintenance_plan"
  | "device_alert_setup_heartbeats"
  | "device_monitoring_review"
  | "campaign_strategy_review"
  | "screen_distribution_optimizer"
  | "campaign_targeting_planner"
  | "campaign_ab_suggester"
  | "campaign_review_scheduler"
  | "studio_engagement_campaign"
  | "studio_training_guide"
  | "studio_goal_planner"
  | "content_calendar_builder";

export interface OrchestratorContext {
  tenantId: string;
  userId: string;
  source: "insight_card" | "report" | "pdf_preview";
  insightId?: string;
  locale?: string;
}

export interface OrchestratorInsightRequest {
  entryPoint: OrchestratorEntryPoint;
  payload: any;
  context: OrchestratorContext;
}

export interface OrchestratorInsightResponse {
  ok: boolean;
  taskId: string;
  status: "queued" | "running" | "completed" | "failed";
  message?: string;
}

export interface OrchestratorTask {
  id: string;
  entryPoint: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: any;
  createdAt: string;
  updatedAt: string;
}

export interface OrchestratorTaskResponse {
  ok: boolean;
  task: OrchestratorTask;
}

// ============================================================================
// Orchestrator API Client Functions
// ============================================================================

/**
 * Execute an orchestrator insight action
 * 
 * @param baseUrl - Base URL of the Cardbey Core API
 * @param request - Orchestrator request with entryPoint, payload, and context
 * @param options - Optional fetch options
 * @returns Promise with task ID and initial status
 */
export async function executeOrchestratorInsight(
  baseUrl: string,
  request: OrchestratorInsightRequest,
  options?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
): Promise<OrchestratorInsightResponse> {
  const url = `${baseUrl}/api/orchestrator/insights/execute`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: JSON.stringify(request),
    signal: options?.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get orchestrator task status
 * 
 * IMPORTANT: The correct path is `/api/orchestrator/insights/task/:taskId` (singular "task", not "tasks")
 * 
 * @param baseUrl - Base URL of the Cardbey Core API
 * @param taskId - Task ID to fetch
 * @param options - Optional fetch options
 * @returns Promise with task status and result
 */
export async function getOrchestratorTask(
  baseUrl: string,
  taskId: string,
  options?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
): Promise<OrchestratorTaskResponse> {
  // CORRECT PATH: /api/orchestrator/insights/task/:taskId (singular "task")
  const url = `${baseUrl}/api/orchestrator/insights/task/${taskId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    
    // Handle 404 gracefully - task not found/expired
    if (response.status === 404) {
      const notFoundError = new Error(error.message || 'Task not found');
      (notFoundError as any).status = 404;
      (notFoundError as any).error = error.error || 'not_found';
      throw notFoundError;
    }
    
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

