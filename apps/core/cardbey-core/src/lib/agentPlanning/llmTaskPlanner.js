/**
 * LLM task planner (Phase 2): intent + store context → dynamic task graph.
 * Reversible via USE_LLM_TASK_PLANNER=false (registry graph only).
 */

import { llmGateway } from '../llm/llmGateway.ts';
import { readEflFeedback } from '../../services/eflRagReader.js';
import { getToolsForPlanner, getToolDefinition } from '../toolRegistry.js';
import { isLlmPlannerEnabledForIntent as registryIsLlmPlannerEnabledForIntent } from '../missionPlan/intentPipelineRegistry.js';
import { buildRegistryTaskGraph } from './buildRegistryTaskGraph.js';

function parseJsonObjectFromLlmText(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const stripFences = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const o = JSON.parse(stripFences);
    return o != null && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    const start = stripFences.indexOf('{');
    const end = stripFences.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const o = JSON.parse(stripFences.slice(start, end + 1));
        return o != null && typeof o === 'object' && !Array.isArray(o) ? o : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * @param {object} graph
 */
function normalizePlannerTaskTools(tasks) {
  if (!Array.isArray(tasks)) return;
  for (const t of tasks) {
    if (t && typeof t === 'object' && t.tool === 'campaign_research') t.tool = 'market_research';
  }
}

/** RAG + step memory via LangChain when LANGCHAIN_ENABLED=true (see langchainExecutor + orchestrator). */
const LANGCHAIN_PLANNER_TOOLS = new Set(['consensus', 'crm']);

function applyPlannerAgentHintsToTasks(tasks) {
  if (!Array.isArray(tasks)) return;
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const tool = typeof task.tool === 'string' ? task.tool.trim() : '';
    if (!task.agentHint) {
      task.agentHint = LANGCHAIN_PLANNER_TOOLS.has(tool) ? 'langchain' : 'dispatchTool';
    }
  }
}

function taskGraphHasCycle(tasks) {
  const idToDeps = new Map();
  for (const t of tasks) {
    const id = String(t.id);
    const deps = Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [];
    idToDeps.set(id, deps);
  }
  const visiting = new Set();
  const visited = new Set();
  function dfs(u) {
    if (visiting.has(u)) return true;
    if (visited.has(u)) return false;
    visiting.add(u);
    for (const v of idToDeps.get(u) || []) {
      if (dfs(v)) return true;
    }
    visiting.delete(u);
    visited.add(u);
    return false;
  }
  for (const id of idToDeps.keys()) {
    if (dfs(id)) return true;
  }
  return false;
}

export function validateTaskGraph(graph) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.tasks)) return false;
  const tasks = graph.tasks;
  if (tasks.length === 0 || tasks.length > 20) return false;
  const ids = new Set();
  for (const t of tasks) {
    if (!t || typeof t !== 'object') return false;
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    const tool = typeof t.tool === 'string' ? t.tool.trim() : '';
    if (!id || ids.has(id)) return false;
    ids.add(id);
    if (!getToolDefinition(tool)) return false;
    if (t.dependsOn != null && !Array.isArray(t.dependsOn)) return false;
  }
  for (const t of tasks) {
    const deps = Array.isArray(t.dependsOn) ? t.dependsOn : [];
    for (const d of deps) {
      if (!ids.has(String(d))) return false;
    }
  }
  if (taskGraphHasCycle(tasks)) return false;
  return true;
}

export function isLlmPlannerEnabledForIntent(intentType) {
  return registryIsLlmPlannerEnabledForIntent(intentType);
}

/**
 * @param {{
 *   intentType: string;
 *   context?: Record<string, unknown>;
 *   tenantKey: string;
 * }} args
 * @returns {Promise<{ ok: boolean, taskGraph?: object, source?: 'llm' | 'registry_fallback', error?: string }>}
 */
export async function planTaskGraphForIntent(args) {
  const intentType = typeof args.intentType === 'string' ? args.intentType.trim() : '';
  const tenantKey = typeof args.tenantKey === 'string' && args.tenantKey.trim() ? args.tenantKey.trim() : 'mission_plan';
  const context = args.context && typeof args.context === 'object' && !Array.isArray(args.context) ? args.context : {};
  const missionId =
    typeof context.missionId === 'string' && context.missionId.trim() ? context.missionId.trim() : '';
  let hypothesisContext = '';
  if (missionId) {
    try {
      const { getPrismaClient } = await import('../prisma.js');
      const prisma = getPrismaClient();
      const ctx = await prisma.missionContext.findUnique({
        where: { missionId },
      });
      if (ctx?.contextJson) {
        const parsed = JSON.parse(ctx.contextJson);
        if (parsed.hypothesis?.userGoalSentence) {
          hypothesisContext = `
Mission hypothesis:
- Goal: ${parsed.hypothesis.userGoalSentence}
- Expected outcome: ${parsed.hypothesis.expectedOutcome}
- Planning hints: ${(parsed.hypothesis.planningHints ?? []).join(', ')}
- Confidence: ${parsed.hypothesis.confidenceScore}
`.trim();
        }
      }
    } catch (_) {}
  }
  const fallback = () => ({
    ok: true,
    taskGraph: buildRegistryTaskGraph(intentType),
    source: /** @type {'registry_fallback'} */ ('registry_fallback'),
  });
  if (!isLlmPlannerEnabledForIntent(intentType)) {
    return fallback();
  }
  if (process.env.LLM_ENABLED === 'false') {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[llmTaskPlanner] LLM_ENABLED=false, using registry task graph');
    }
    return fallback();
  }
  const tools = getToolsForPlanner();
  const toolJson = JSON.stringify(tools, null, 0);
  const ctxJson = JSON.stringify(context, null, 0);
  const storeType = context?.storeType ?? context?.businessType ?? 'unknown';
  const eflFeedback = await readEflFeedback(
    `${storeType} ${intentType || 'mission'}`,
    { storeType, intent: intentType, limit: 3, minWeight: 0.6 }
  ).catch(() => []);
  const eflContext =
    eflFeedback.length > 0
      ? `\nLearnings from past similar missions:\n${eflFeedback.map((f) => `- ${f.observation}`).join('\n')}\n`
      : '';
  const prompt = `You are a mission task planner for a commerce app. Given intent and store context, output ONLY valid JSON (no markdown) with this shape:
{"tasks":[{"id":"string","tool":"registered_tool_name","label":"short label","dependsOn":["id",...],"agentHint":"dispatchTool"|"openclaw"|"langchain","inputHints":{}}]}
Rules:
- Use only tool names from the allowed list.
- dependsOn lists task ids that must complete first; use [] for roots.
- Prefer agentHint "dispatchTool" unless the step needs OpenClaw ("openclaw") or RAG+memory LangChain ("langchain").
- Produce 3–12 tasks tailored to the intent (any type): e.g. launch_campaign → research, consensus, store analysis, promotion, activation, content, crm when relevant; generate_social / store improvement → analyze_store then content/social tools; store / rewrite / tags / hero → lean chains with analyze_store and the right follow-on tools; signage / screens → resolve/prepare/assign/activate screen tools when in the list.
- inputHints may include hints only; storeId usually comes from runtime context.
Intent: ${intentType}
Store context: ${ctxJson}
Allowed tools (name, description, category): ${toolJson}`;
  let finalPrompt = hypothesisContext ? `${prompt}\n\n${hypothesisContext}` : prompt;
  if (eflContext) finalPrompt = `${finalPrompt}${eflContext}`;
  try {
    const gen = await llmGateway.generate({
      purpose: 'mission_task_graph',
      prompt: finalPrompt,
      tenantKey,
      responseFormat: 'json',
      maxTokens: 2500,
      temperature: 0.2,
    });
    const parsed = parseJsonObjectFromLlmText(gen.text);
    const tasks = parsed?.tasks;
    if (Array.isArray(tasks)) {
      normalizePlannerTaskTools(tasks);
      applyPlannerAgentHintsToTasks(tasks);
    }
    const graph = tasks ? { version: 'llm_v1', tasks } : null;
    if (graph && validateTaskGraph(graph)) {
      return { ok: true, taskGraph: graph, source: 'llm' };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[llmTaskPlanner] LLM graph invalid or empty, falling back to registry');
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[llmTaskPlanner] LLM error, registry fallback:', e?.message || e);
    }
  }
  return fallback();
}
