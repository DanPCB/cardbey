/**
 * Deterministic task graph from intentPipelineRegistry (LLM off or planner failure).
 */

import { getPipelineForIntent } from '../missionPlan/intentPipelineRegistry.js';
import { getToolDefinition } from '../toolRegistry.js';

/**
 * @param {string} intentType
 * @returns {{ version: string, tasks: Array<{ id: string, tool: string, label: string, dependsOn: string[], agentHint: string }> }}
 */
export function buildRegistryTaskGraph(intentType) {
  const key = typeof intentType === 'string' ? intentType.trim() : '';
  const pipeline = getPipelineForIntent(key);
  const names = Array.isArray(pipeline.stepToolNames) ? pipeline.stepToolNames : [];
  const checkpoints = Array.isArray(pipeline.checkpoints) ? pipeline.checkpoints : [];
  const tasks = [];
  let prevId = null;
  for (let i = 0; i < names.length; i += 1) {
    const tool = names[i];
    if (!getToolDefinition(tool)) continue;
    const id = `registry_step_${tasks.length}`;
    const dependsOn = prevId ? [prevId] : [];
    tasks.push({
      id,
      tool,
      label: checkpoints[i] || tool,
      dependsOn,
      agentHint: 'dispatchTool',
    });
    prevId = id;
  }
  return { version: 'registry_v1', tasks };
}
