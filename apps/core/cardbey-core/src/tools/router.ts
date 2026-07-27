/**
 * Tool router: map task.intent to toolKey. Fall back to existing executor when no tool found.
 * Used only when ENABLE_TOOL_ADAPTER=true.
 */

import { getTool } from './registry';

/** Map task intent (from plan/execution_suggestions) to registered tool key. */
const INTENT_TO_TOOL: Record<string, string> = {
  store_fix_image_mismatch: 'tool_store_fix_image_mismatch_v1',
  creative_create_product_slideshow: 'tool_creative_slideshow_pptx_v1',
  social_generate_launch_pack: 'tool_launchpack_zip_v1',
};

export interface TaskLike {
  id?: string;
  intent?: string | null;
  agentKey?: string | null;
}

/**
 * Resolve a tool key for this task. Returns toolKey if a tool is registered for the task's intent
 * (or run.input.toolKey); otherwise undefined (caller falls back to existing LLM/executor).
 */
export function resolveToolForTask(task: TaskLike | null, runInput?: { toolKey?: string; intent?: string } | null): string | undefined {
  const explicitToolKey = runInput?.toolKey && typeof runInput.toolKey === 'string' ? runInput.toolKey.trim() : undefined;
  if (explicitToolKey && getTool(explicitToolKey)) {
    return explicitToolKey;
  }
  const intent = runInput?.intent ?? task?.intent;
  if (!intent || typeof intent !== 'string') return undefined;
  const toolKey = INTENT_TO_TOOL[intent.trim()];
  if (!toolKey || !getTool(toolKey)) return undefined;
  return toolKey;
}

export { INTENT_TO_TOOL };
