/**
 * DeepSeek tool-calling types — distinct from the tool-adapter layer in registry.ts.
 */

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolExecutionContext {
  userId?: string | null;
  storeId?: string | null;
  missionId?: string | null;
  sessionId?: string | null;
  source?: string;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  summary?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>, context?: ToolExecutionContext) => Promise<ToolResult>;
}

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ToolCallTrace {
  id: string;
  name: string;
  status: ToolCallStatus;
  parameters?: Record<string, unknown>;
  result?: ToolResult;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ToolCallingResult {
  content: string;
  toolCalls: ToolCallTrace[];
  thinkingText?: string;
}
