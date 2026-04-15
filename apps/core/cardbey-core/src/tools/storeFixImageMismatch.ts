/**
 * tool_store_fix_image_mismatch_v1: wraps existing internalTools store_fix_image_mismatch.
 */

import type { ToolContext, ToolResult } from './registry';
import { registerTool } from './registry';

const TOOL_KEY = 'tool_store_fix_image_mismatch_v1';

async function runStoreFixImageMismatch(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> {
  const { executeInternalTool } = await import('../lib/internalTools.js');
  const runInput = {
    storeId: input.storeId,
    generationRunId: input.generationRunId,
  };
  const run = { id: ctx.runId, input: runInput };
  const result = await executeInternalTool(ctx.missionId, 'store_fix_image_mismatch', runInput, run);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    summary: result.summary ?? { message: 'Catalog repair completed.' },
    artifacts: [
      {
        title: `Internal operation: store_fix_image_mismatch`,
        mimeType: 'application/json',
        internalTool: TOOL_KEY,
        payload: {
          title: 'Store fix image mismatch',
          internalTool: TOOL_KEY,
          summary: result.summary,
        },
      },
    ],
  };
}

const spec = {
  toolKey: TOOL_KEY,
  capabilities: ['store', 'catalog'],
  risk: 'R1' as const,
  executionMode: 'sync' as const,
  inputSchema: {
    required: ['missionId', 'storeId'],
    optional: ['generationRunId'],
    types: { missionId: 'string', storeId: 'string', generationRunId: 'string' },
  },
  outputSchema: { summary: true },
  requiredSecrets: [],
  retries: 0,
  timeoutMs: 60000,
};

export function registerStoreFixImageMismatchTool(): void {
  registerTool(spec, runStoreFixImageMismatch);
}
