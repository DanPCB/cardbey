/**
 * Tool runner: executeTool with validation, risk gates, timeout, retry, lifecycle and audit.
 * Used only when ENABLE_TOOL_ADAPTER=true.
 */

import type { ToolSpec, ToolContext, ToolResult } from './registry';
import { getTool } from './registry';

export interface ExecuteToolOptions {
  /** If risk is R3 and this returns false, emit approval_required and return blocked. */
  checkApprovalForTask?: (taskId: string) => Promise<boolean>;
  /** Secrets available in env (e.g. process.env). Used to enforce requiredSecrets for external tools. */
  getSecrets?: () => Record<string, string | undefined>;
  /** Post run_lifecycle system message (running/completed/failed). */
  postLifecycle?: (payload: Record<string, unknown>) => Promise<void>;
  /** Create audit event. */
  audit?: (data: { entityType: string; entityId: string; action: string; actorType: string; actorId?: string; reason?: string; metadata?: Record<string, unknown> }) => Promise<void>;
}

function validateInput(spec: ToolSpec, input: Record<string, unknown>): { valid: boolean; error?: string } {
  const schema = spec.inputSchema;
  if (!schema) return { valid: true };
  const required = schema.required ?? [];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null) {
      return { valid: false, error: `Missing required input: ${key}` };
    }
  }
  if (schema.types) {
    for (const [key, expected] of Object.entries(schema.types)) {
      const v = input[key];
      if (v === undefined) continue;
      const t = Array.isArray(v) ? 'array' : typeof v;
      if (t !== expected) {
        return { valid: false, error: `Input ${key} expected type ${expected}, got ${t}` };
      }
    }
  }
  return { valid: true };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tool timed out after ${ms}ms`)), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Execute a tool by key. Validates input, enforces risk/approval and requiredSecrets, runs with timeout/retry,
 * then invokes postLifecycle and audit when provided.
 */
export async function executeTool(
  toolKey: string,
  ctx: ToolContext,
  input: Record<string, unknown>,
  options: ExecuteToolOptions = {}
): Promise<ToolResult> {
  const entry = getTool(toolKey);
  if (!entry) {
    return { ok: false, error: `Unknown tool: ${toolKey}` };
  }
  const { spec, impl } = entry;
  const { checkApprovalForTask, getSecrets, postLifecycle, audit } = options;

  const validation = validateInput(spec, input);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  if (spec.risk === 'R3' && ctx.taskId && checkApprovalForTask) {
    const approved = await checkApprovalForTask(ctx.taskId);
    if (!approved) {
      return {
        ok: false,
        blocked: true,
        error: 'R3 tool requires approval before execution',
      };
    }
  }

  if (spec.requiredSecrets && spec.requiredSecrets.length > 0 && getSecrets) {
    const secrets = getSecrets();
    for (const key of spec.requiredSecrets) {
      if (!secrets[key] || String(secrets[key]).trim() === '') {
        return { ok: false, error: `Missing required secret: ${key}` };
      }
    }
  }

  const timeoutMs = spec.timeoutMs ?? 60000;
  const maxRetries = Math.max(0, spec.retries ?? 0);

  if (postLifecycle) {
    await postLifecycle({
      kind: 'run_lifecycle',
      runId: ctx.runId,
      agentKey: 'tool',
      status: 'running',
      toolKey,
    }).catch(() => {});
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(impl(ctx, input), timeoutMs);
      if (audit && ctx.missionId) {
        await audit({
          entityType: 'Mission',
          entityId: ctx.missionId,
          action: 'tool_executed',
          actorType: 'automation',
          actorId: ctx.runId ?? undefined,
          reason: 'TOOL_ADAPTER',
          metadata: { toolKey, taskId: ctx.taskId, ok: result.ok },
        }).catch(() => {});
      }
      if (postLifecycle) {
        await postLifecycle({
          kind: 'run_lifecycle',
          runId: ctx.runId,
          agentKey: 'tool',
          status: result.ok ? 'completed' : 'failed',
          toolKey,
          summary: result.summary,
          error: result.error,
        }).catch(() => {});
      }
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(500 * Math.pow(2, attempt), 5000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  const errMsg = lastError?.message ?? 'Tool execution failed';
  if (postLifecycle) {
    await postLifecycle({
      kind: 'run_lifecycle',
      runId: ctx.runId,
      agentKey: 'tool',
      status: 'failed',
      toolKey,
      error: errMsg,
    }).catch(() => {});
  }
  return { ok: false, error: errMsg };
}
