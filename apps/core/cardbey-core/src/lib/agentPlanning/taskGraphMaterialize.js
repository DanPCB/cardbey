/**
 * Turn an LLM (or registry) task graph into MissionPipelineStep configs.
 */

import { getToolDefinition } from '../toolRegistry.js';

/** @param {string} tool */
function normalizeToolName(tool) {
  const name = typeof tool === 'string' ? tool.trim() : '';
  const aliases = { campaign_research: 'market_research' };
  return aliases[name] || name;
}

/**
 * Topological order (dependencies before dependents). Cycles: skip revisiting.
 * @param {Array<{ id: string, dependsOn?: string[] }>} tasks
 * @returns {typeof tasks}
 */
function topoSortTasks(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visiting = new Set();
  const done = new Set();
  const result = [];

  function dfs(id) {
    if (done.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    const t = byId.get(id);
    const deps = Array.isArray(t?.dependsOn) ? t.dependsOn : [];
    for (const d of deps) dfs(String(d));
    visiting.delete(id);
    done.add(id);
    if (t) result.push(t);
  }

  for (const t of tasks) dfs(t.id);
  return result;
}

/**
 * @param {{ tasks?: Array<{ id?: string, tool?: string, label?: string, dependsOn?: string[], agentHint?: string, inputHints?: object }> }} taskGraph
 * @returns {{ toolName: string, label: string, orderIndex: number, inputJson?: object }[]}
 */
export function materializeStepsFromTaskGraph(taskGraph) {
  const raw = taskGraph?.tasks;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const normalized = raw.map((t, i) => {
    const id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `task_${i}`;
    const tool = normalizeToolName(t.tool);
    return {
      id,
      tool,
      label: typeof t.label === 'string' && t.label.trim() ? t.label.trim() : tool,
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
      agentHint: t.agentHint === 'openclaw' ? 'openclaw' : 'dispatchTool',
      inputHints: t.inputHints && typeof t.inputHints === 'object' && !Array.isArray(t.inputHints) ? t.inputHints : {},
    };
  });

  const sorted = topoSortTasks(normalized);
  const configs = [];
  let orderIndex = 0;
  for (const t of sorted) {
    const def = getToolDefinition(t.tool);
    if (!def) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[TaskGraphMaterialize] skipping unregistered tool: ${t.tool}`);
      }
      continue;
    }
    const inputJson = { ...t.inputHints };
    if (t.agentHint === 'openclaw') inputJson._agentHint = 'openclaw';
    configs.push({
      toolName: t.tool,
      label: t.label || def.label || t.tool,
      orderIndex: orderIndex++,
      ...(Object.keys(inputJson).length > 0 ? { inputJson } : {}),
    });
  }
  return configs;
}

/**
 * Map a validated task graph to Performer intake proactive_plan step rows (topological order).
 * `market_research` is exposed as `campaign_research` for the marketing runway UI.
 *
 * @param {{ tasks?: Array<{ id?: string, tool?: string, label?: string, dependsOn?: string[], agentHint?: string, inputHints?: object }> }} taskGraph
 * @returns {Array<{ step: number, title: string, description: string, recommendedTool: string, parameters: object, agentHint: string, taskId: string }>}
 */
export function taskGraphToProactivePlan(taskGraph) {
  const raw = taskGraph?.tasks;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const normalized = raw.map((t, i) => {
    const id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `task_${i}`;
    const tool = normalizeToolName(t.tool);
    return {
      id,
      tool,
      label: typeof t.label === 'string' && t.label.trim() ? t.label.trim() : tool,
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
      agentHint: t.agentHint === 'openclaw' ? 'openclaw' : 'dispatchTool',
      inputHints: t.inputHints && typeof t.inputHints === 'object' && !Array.isArray(t.inputHints) ? t.inputHints : {},
    };
  });

  const sorted = topoSortTasks(normalized);
  const out = [];
  let stepNum = 1;
  for (const t of sorted) {
    if (!getToolDefinition(t.tool)) continue;
    const hints = { ...t.inputHints };
    const desc =
      typeof hints.goal === 'string' && hints.goal.trim()
        ? hints.goal.trim()
        : typeof t.label === 'string'
          ? t.label
          : t.tool;
    const recommendedTool = t.tool === 'market_research' ? 'campaign_research' : t.tool;
    out.push({
      step: stepNum++,
      title: t.label || recommendedTool,
      description: desc,
      recommendedTool,
      parameters: hints,
      agentHint: t.agentHint || 'dispatchTool',
      taskId: t.id,
    });
  }
  return out;
}
