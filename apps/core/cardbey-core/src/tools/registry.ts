/**
 * Tool Adapter Layer – Tool registry and spec interface.
 * Tools are invoked only when ENABLE_TOOL_ADAPTER=true and task/run resolves to a toolKey.
 * Additive: existing intents continue to use existing executors when no tool is resolved.
 */

export type RiskLevel = 'R0' | 'R1' | 'R2' | 'R3';
export type ExecutionMode = 'sync' | 'async';

/** Lightweight input schema: required keys and optional keys. Validation is type/required only. */
export interface ToolInputSchema {
  required?: string[];
  optional?: string[];
  /** Optional: map key -> 'string' | 'number' | 'boolean' | 'object' | 'array' for type check */
  types?: Record<string, string>;
}

/** Output shape for artifacts (artifactId, downloadUrl, contentsList). */
export interface ToolOutputSchema {
  artifactId?: boolean;
  downloadUrl?: boolean;
  contentsList?: boolean;
  summary?: boolean;
}

export interface ToolSpec {
  toolKey: string;
  capabilities: string[];
  risk: RiskLevel;
  executionMode: ExecutionMode;
  inputSchema: ToolInputSchema;
  outputSchema: ToolOutputSchema;
  requiredSecrets: string[];
  /** Max retries on transient failure (default 0). */
  retries?: number;
  /** Timeout in ms (default 60000). */
  timeoutMs?: number;
}

export interface ToolContext {
  missionId: string;
  runId?: string;
  taskId?: string;
  userId?: string;
  tenantId?: string;
}

/** Result of a tool run: success with artifacts, or blocked (approval required), or error. */
export interface ToolResult {
  ok: boolean;
  blocked?: boolean;
  approvalRequiredMessageId?: string;
  error?: string;
  summary?: Record<string, unknown>;
  artifacts?: Array<{
    title: string;
    mimeType?: string;
    payload: Record<string, unknown>;
    internalTool?: string;
  }>;
  /** For artifact message: downloadUrl if stored externally */
  downloadUrl?: string | null;
  contentsList?: string[];
}

/** Tool implementation: (ctx, input) => Promise<ToolResult> */
export type ToolImpl = (ctx: ToolContext, input: Record<string, unknown>) => Promise<ToolResult>;

const registry = new Map<string, { spec: ToolSpec; impl: ToolImpl }>();

export function registerTool(spec: ToolSpec, impl: ToolImpl): void {
  if (registry.has(spec.toolKey)) {
    console.warn(`[tools/registry] Tool "${spec.toolKey}" already registered, overwriting`);
  }
  registry.set(spec.toolKey, { spec, impl });
}

export function getTool(toolKey: string): { spec: ToolSpec; impl: ToolImpl } | undefined {
  return registry.get(toolKey);
}

export function getToolSpec(toolKey: string): ToolSpec | undefined {
  return registry.get(toolKey)?.spec;
}

export function listToolKeys(): string[] {
  return Array.from(registry.keys());
}
