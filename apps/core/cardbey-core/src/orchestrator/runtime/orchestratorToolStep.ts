/**
 * Tool step recorded during an orchestrator run for tool-completeness and reward.
 * Persisted under OrchestratorTask.result.toolSteps.
 */
export interface OrchestratorToolStep {
  toolName: string;
  args: Record<string, unknown>;
  status: 'ok' | 'error';
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
}
