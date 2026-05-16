/**
 * tool_creative_slideshow_pptx_v1: stub (not implemented). Returns error so executor can fall back or show message.
 */

import type { ToolContext, ToolResult } from './registry';
import { registerTool } from './registry';

const TOOL_KEY = 'tool_creative_slideshow_pptx_v1';

async function runSlideshowStub(_ctx: ToolContext, _input: Record<string, unknown>): Promise<ToolResult> {
  return { ok: false, error: 'tool_creative_slideshow_pptx_v1 not implemented' };
}

const spec = {
  toolKey: TOOL_KEY,
  capabilities: ['creative', 'slideshow'],
  risk: 'R1' as const,
  executionMode: 'sync' as const,
  inputSchema: { required: ['missionId'], optional: [] },
  outputSchema: {},
  requiredSecrets: [],
  retries: 0,
  timeoutMs: 60000,
};

export function registerCreativeSlideshowStub(): void {
  registerTool(spec, runSlideshowStub);
}
