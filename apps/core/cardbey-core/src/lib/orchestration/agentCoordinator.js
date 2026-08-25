/**
 * Multi-agent orchestration coordinator ? wave execution, spawn policy, campaign specialists.
 * V1 (PHASE_B): agents load dynamically; stubs used when modules are missing.
 */

import { llmGateway } from '../llm/llmGateway.ts';
import { loadAgentClass } from './agentLoader.js';
import { evaluateWave } from './spawnPolicy.js';
import { loadStoreKnowledgeForAgents } from './storeKnowledgeForAgents.js';
import { withAgentRetry } from './agentRetry.js';
import { runVerifyStep } from './verifyStep.js';
import { scheduleLearnStep } from './learnStep.js';
import {
  createStore as createRuntimeStore,
  getStore as getRuntimeStore,
  toBlackboardSnapshot,
  tickAgent,
  advanceWave,
  isNearBudget,
  isOverBudget,
} from '../../orchestrator/memory/runtimeMemory.js';

function asObject(val) {
  return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
}

function withTimeout(promise, timeoutMs) {
  const ms = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30_000;
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function callClaudeJson({
  tenantKey,
  purpose,
  system,
  user,
  maxTokens = 900,
  temperature = 0.2,
  agentName = 'AgentCoordinator',
  missionId = null,
  sseEmitter = null,
}) {
  try {
    const prompt = `${String(system || '').trim()}\n\n${String(user || '').trim()}`.trim();
    const out = await withAgentRetry(
      () =>
        llmGateway.generate({
          purpose,
          prompt,
          provider: 'anthropic',
          responseFormat: 'json',
          tenantKey: tenantKey || 'default',
          maxTokens,
          temperature,
        }),
      { agentName, missionId, sseEmitter },
    );
    const text = out?.text ?? '';
    const cleaned = String(text)
      .split('\n')
      .filter((line) => !line.match(/^```/))
      .join('\n')
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[AgentCoordinator] callClaudeJson unavailable (V1 fallback):', e?.message || e);
    return null;
  }
}

function buildCampaignTasks(goal) {
  const g = String(goal ?? '').trim() || 'Campaign orchestration';
  return [
    { taskId: 'brief_1', agentType: 'brief', description: g, goal: g, dependsOn: [] },
    {
      taskId: 'graphics_1',
      agentType: 'graphics',
      description: 'Generate promotional poster',
      dependsOn: ['brief_1'],
    },
    {
      taskId: 'slideshow_1',
      agentType: 'slideshow',
      description: 'Generate campaign slideshow',
      dependsOn: ['brief_1'],
    },
    { taskId: 'copy_1', agentType: 'copy', description: 'Write platform copy', goal: g, dependsOn: ['brief_1'] },
    {
      taskId: 'qa_1',
      agentType: 'qa',
      description: 'QA campaign deliverables',
      dependsOn: ['graphics_1', 'slideshow_1', 'copy_1'],
      inputs: { requirements: 'Validate campaign poster, slideshow, and copy quality' },
    },
    {
      taskId: 'package_1',
      agentType: 'package',
      description: 'Assemble campaign package',
      dependsOn: ['qa_1'],
    },
  ];
}

export class AgentCoordinator {
  /**
   * @param {{
   *   missionId: string,
   *   blackboard?: { appendEvent?: Function, getEvents?: Function, flushOrchestrationEvents?: Function },
   *   locale?: string,
   *   tenantKey?: string,
   *   orchestrationKind?: string,
   *   baseContext?: object,
   * }} opts
   */
  constructor(opts = {}) {
    this.missionId = String(opts.missionId ?? '').trim();
    this.blackboard = opts.blackboard ?? null;
    this.locale = opts.locale ?? 'en';
    this.tenantKey = opts.tenantKey ?? 'default';
    this.orchestrationKind = opts.orchestrationKind ?? 'default';
    this.sseEmitter =
      opts.sseEmitter && typeof opts.sseEmitter === 'object' ? opts.sseEmitter : null;
    this.baseContext =
      opts.baseContext && typeof opts.baseContext === 'object' && !Array.isArray(opts.baseContext)
        ? opts.baseContext
        : {};
    this.agents = new Map();
    this.results = new Map();
    this.maxAgents = 8;
    this.agentTimeoutMs = 30_000;
    this.totalSpawned = 0;
    this.batchingEnabled =
      typeof this.blackboard?.appendEventBatch === 'function' &&
      typeof this.blackboard?.flushOrchestrationEvents === 'function';
    this.activeWaveCount = 0;
  }

  async fetchPriorWork() {
    try {
      if (!this.blackboard?.getEvents) return [];
      const raw = await this.blackboard.getEvents(this.missionId, 'agent_completed');
      const events = Array.isArray(raw) ? raw : raw?.events ?? [];
      return events
        .map((ev) => {
          const payload = asObject(ev?.payload);
          return {
            agentType: payload.agentType ?? ev?.agentType,
            taskId: payload.taskId ?? ev?.taskId,
            summary: payload.summary ?? '',
            result: payload.result ?? null,
            confidence: payload.confidence,
          };
        })
        .filter((p) => p.agentType);
    } catch (e) {
      console.warn('[AgentCoordinator] fetchPriorWork failed (non-fatal):', e?.message || e);
      return [];
    }
  }

  async decomposeGoal(goal, context) {
    if (this.orchestrationKind === 'campaign_orchestration') {
      try {
        const response = await withTimeout(
          callClaudeJson({
            tenantKey: this.tenantKey,
            purpose: 'orchestration:campaign_decompose',
            system: `You are a campaign mission coordinator.
Decompose the goal into subtasks for specialist agents.
Each subtask MUST specify:
  - taskId (unique string)
  - agentType: brief|graphics|slideshow|copy|qa|package
  - description
  - dependsOn (taskIds that must complete first)
Use this wave order:
  1) brief (no deps)
  2) graphics, slideshow, copy in parallel (depend on brief)
  3) qa (depends on graphics, slideshow, copy)
  4) package (depends on qa)
Return JSON only as an array. Max 8 tasks.`,
            user: `Goal: ${goal}\nContext: ${JSON.stringify(context)}`,
            maxTokens: 1200,
            temperature: 0.2,
            agentName: 'AgentCoordinator.campaign_decompose',
            missionId: this.missionId,
            sseEmitter: this.sseEmitter,
          }),
          this.agentTimeoutMs,
        );
        const tasks = Array.isArray(response) ? response : [];
        if (tasks.length) return tasks.slice(0, this.maxAgents);
      } catch (e) {
        console.warn('[AgentCoordinator] campaign decompose failed, using default waves:', e?.message || e);
      }
      return buildCampaignTasks(goal);
    }

    try {
      const response = await withTimeout(
        callClaudeJson({
          tenantKey: this.tenantKey,
          purpose: 'orchestration:decompose',
          system: `You are a mission coordinator.
Decompose the given goal into 2-4 subtasks.
Each subtask MUST specify:
  - taskId (unique string)
  - agentType: research|build|qa|action
  - description (what to do)
  - inputs (what data it needs)
  - dependsOn (taskIds that must complete first)
Return JSON only as an array.`,
          user: `Goal: ${goal}\nContext: ${JSON.stringify(context)}`,
          maxTokens: 900,
          temperature: 0.2,
          agentName: 'AgentCoordinator.decompose',
          missionId: this.missionId,
          sseEmitter: this.sseEmitter,
        }),
        this.agentTimeoutMs,
      );
      if (response && Array.isArray(response)) {
        return response.slice(0, this.maxAgents);
      }
      return [];
    } catch (e) {
      console.warn('[AgentCoordinator] decomposeGoal failed:', e?.message || e);
      return [];
    }
  }

  async createAgent(agentType) {
    const t = String(agentType || '').trim() || 'research';
    const AgentClass = await loadAgentClass(t);
    if (t === 'action' || t === 'graphics' || t === 'slideshow') {
      return new AgentClass({ context: this.baseContext });
    }
    if (t === 'package') {
      return new AgentClass({ tenantKey: this.tenantKey, context: this.baseContext });
    }
    return new AgentClass({
      tenantKey: this.tenantKey,
      locale: this.locale,
      context: this.baseContext,
    });
  }

  async assignTask(task) {
    const safeTask = asObject(task);
    const taskId = String(safeTask.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(safeTask.agentType ?? '').trim() || 'research';
    const description = typeof safeTask.description === 'string' ? safeTask.description : '';

    const priorWork = await this.fetchPriorWork();
    const enriched = { ...safeTask, taskId, agentType, priorWork, goal: safeTask.goal ?? safeTask.description };

    try {
      const agent = await this.createAgent(agentType);
      this.agents.set(taskId, agent);
      this.totalSpawned += 1;

      try {
        tickAgent(this.missionId, taskId, 'running', { agentType });
      } catch {
        // non-fatal
      }

      if (this.blackboard?.appendEvent) {
        await this.blackboard.appendEvent(this.missionId, 'agent_assigned', {
          taskId,
          agentType,
          description,
        });
      }

      const exec = agent.execute(enriched);
      const value = await withTimeout(exec, this.agentTimeoutMs);

      try {
        tickAgent(this.missionId, taskId, 'completed', { agentType, tokenCost: 500 });
      } catch {
        // non-fatal
      }

      return value;
    } catch (e) {
      console.warn('[AgentCoordinator] assignTask failed:', e?.message || e);
      try {
        tickAgent(this.missionId, taskId, 'failed', { agentType, error: e?.message || String(e) });
      } catch {
        // non-fatal
      }
      return {
        taskId,
        agentType,
        result: null,
        summary: `Failed: ${e?.message || String(e)}`,
        confidence: 0,
        latencyMs: 0,
        error: { message: e?.message || String(e) },
      };
    }
  }

  /**
   * @param {string} goal
   * @param {object} [missionContext]
   * @returns {Promise<Record<string, { agentType?: string, result?: object, summary?: string, confidence?: number, taskId?: string }>>}
   */
  async orchestrate(goal, missionContext = {}) {
    const safeContext = asObject(missionContext);

    // SKP once per run — shared via baseContext.storeKnowledge (no per-agent Prisma store reads).
    const storeId =
      String(safeContext.storeId ?? this.baseContext.storeId ?? this.baseContext.targetId ?? '').trim() ||
      null;
    if (storeId && this.baseContext.storeKnowledge == null) {
      const storeKnowledge = await loadStoreKnowledgeForAgents(storeId, {
        buildSKPFn: this._buildSKPFn,
      });
      this.baseContext = {
        ...this.baseContext,
        storeId,
        storeKnowledge,
      };
      if (
        storeKnowledge &&
        storeKnowledge.enrichmentStatus &&
        storeKnowledge.enrichmentStatus !== 'ENRICHED' &&
        this.blackboard?.appendEvent
      ) {
        try {
          await this.blackboard.appendEvent(this.missionId, 'DATA_QUALITY_WARNING', {
            enrichmentStatus: storeKnowledge.enrichmentStatus,
            storeId,
            note: `Store data is ${storeKnowledge.enrichmentStatus} — research output may be limited`,
          });
        } catch {
          // non-fatal
        }
      }
    }

    try {
      createRuntimeStore(this.missionId, this.tenantKey, this.orchestrationKind);
      if (this.blackboard?.appendEvent) {
        await this.blackboard.appendEvent(this.missionId, 'runtime.execution.started', {
          orchestrationKind: this.orchestrationKind,
          hasStoreKnowledge: Boolean(this.baseContext.storeKnowledge),
        });
      }
    } catch (e) {
      if (!String(e?.message ?? '').includes('runtime_memory_store_exists')) {
        console.warn('[AgentCoordinator] RuntimeMemory createStore:', e?.message || e);
      }
    }

    let tasks = await this.decomposeGoal(goal, { ...safeContext, ...this.baseContext });
    if (!Array.isArray(tasks)) tasks = [];
    tasks = tasks.slice(0, this.maxAgents);

    const completed = new Set();
    const pending = [...tasks];
    let halted = false;
    let waveIndex = 0;

    while (pending.length > 0 && !halted) {
      if (isOverBudget(this.missionId)) {
        if (this.blackboard?.appendEvent) {
          await this.blackboard.appendEvent(this.missionId, 'runtime.token_budget_warning', {
            ...getRuntimeStore(this.missionId)?.tokenBudget,
          });
        }
        break;
      }

      const ready = pending.filter((t) => {
        const deps = Array.isArray(t?.dependsOn) ? t.dependsOn : [];
        return deps.every((d) => completed.has(String(d)));
      });

      if (ready.length === 0) {
        try {
          await this.blackboard?.appendEvent?.(this.missionId, 'agent_failed', {
            taskId: 'orchestration',
            agentType: 'coordinator',
            error: 'circular_or_unmet_dependencies',
          });
        } catch {
          // non-fatal
        }
        break;
      }

      advanceWave(
        this.missionId,
        ready.map((t) => String(t?.taskId ?? '').trim()).filter(Boolean),
      );
      this.activeWaveCount += 1;

      const missionId = this.baseContext?.missionId ?? this.missionId ?? null;
      for (const task of ready) {
        if (missionId) {
          console.log(
            '[AgentCoordinator] agent_step_start ' +
              JSON.stringify({
                missionId,
                step: waveIndex + 1,
                agentType: task?.agentType,
                taskId: task?.taskId,
              }),
          );
        }
      }

      const settled = await Promise.allSettled(ready.map((t) => this.assignTask(t)));
      const waveResults = [];

      for (let i = 0; i < ready.length; i += 1) {
        const task = ready[i];
        const result = settled[i];
        const taskId = String(task?.taskId ?? '').trim();
        const agentType = String(task?.agentType ?? '').trim();

        completed.add(taskId);
        this.results.set(taskId, { task, settled: result });

        const envelope =
          result.status === 'fulfilled' && result.value
            ? result.value
            : {
                taskId,
                agentType,
                result: null,
                summary: result.status === 'rejected' ? String(result.reason?.message ?? result.reason) : 'failed',
                confidence: 0,
              };

        waveResults.push(envelope);

        if (missionId) {
          console.log(
            '[AgentCoordinator] agent_step_complete ' +
              JSON.stringify({
                missionId,
                step: waveIndex + 1,
                agentType: task?.agentType,
                ok: result.status === 'fulfilled' && !!envelope && !envelope.error,
                summary: (envelope?.summary ?? '').slice(0, 80) || null,
              }),
          );
        }

        const idx = pending.indexOf(task);
        if (idx >= 0) pending.splice(idx, 1);

        try {
          await this.blackboard?.appendEvent?.(
            this.missionId,
            result.status === 'fulfilled' && !envelope.error ? 'agent_completed' : 'agent_failed',
            {
              taskId,
              agentType,
              summary: envelope.summary ?? '',
              confidence: envelope.confidence ?? 0,
              result: envelope.result ?? null,
              error: envelope.error ?? (result.status === 'rejected' ? { message: String(result.reason) } : null),
            },
          );
        } catch (e) {
          console.warn('[AgentCoordinator] appendEvent failed:', e?.message || e);
        }
      }

      // Rate limit relief ????? pause between waves for campaign orchestration
      if (this.orchestrationKind === 'campaign_orchestration') {
        await new Promise((r) => setTimeout(r, 4000));
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
      const decisions = evaluateWave(waveResults, this.results, {
        totalSpawned: this.totalSpawned,
        maxAgents: this.maxAgents,
        goal,
      });

      for (const d of decisions) {
        if (d.action === 'halt') {
          halted = true;
          try {
            await this.blackboard?.appendEvent?.(this.missionId, 'orchestration_halt', {
              reason: d.reason,
            });
          } catch {
            // non-fatal
          }
          break;
        }
        if (d.action === 'retry' || d.action === 'spawn') {
          if (d.task) pending.push(d.task);
        }
      }

      try {
        const snap = toBlackboardSnapshot(this.missionId);
        if (snap && this.blackboard?.appendEvent) {
          await this.blackboard.appendEvent(this.missionId, 'runtime.snapshot', snap);
        }
        if (isNearBudget(this.missionId) && this.blackboard?.appendEvent) {
          await this.blackboard.appendEvent(this.missionId, 'runtime.token_budget_warning', {
            ...getRuntimeStore(this.missionId)?.tokenBudget,
          });
        }
      } catch (e) {
        console.warn('[AgentCoordinator] runtime snapshot (non-fatal):', e?.message || e);
      }

      waveIndex += 1;
    }

    const missionIdComplete = this.baseContext?.missionId ?? this.missionId ?? null;
    console.log(
      '[AgentCoordinator] orchestration_complete ' +
        JSON.stringify({
          missionId: missionIdComplete,
          totalAgents: tasks.length,
          ok: true,
        }),
    );

    const merged = this.mergeResults();
    const artifacts = Object.values(merged)
      .map((envelope) => {
        const r = envelope?.result;
        if (!r || typeof r !== 'object') {
          return {
            type: envelope?.agentType ?? 'unknown',
            summary: envelope?.summary,
            result: r,
          };
        }
        return {
          type: r.type ?? envelope?.agentType ?? 'agent_result',
          content: r.content,
          url: r.url ?? r.graphicUrl ?? r.artifactUrl,
          graphicUrl: r.graphicUrl,
          artifactUrl: r.artifactUrl,
          summary: envelope?.summary,
          result: r,
        };
      })
      .filter(Boolean);

    let verifyResult = { passed: false, score: 0, issues: ['verify_skipped'] };
    try {
      verifyResult = await runVerifyStep({
        missionId: this.missionId,
        brief: String(goal ?? ''),
        artifacts,
        storeKnowledge: this.baseContext.storeKnowledge ?? null,
        blackboard: this.blackboard,
      });
    } catch (err) {
      console.warn('[AgentCoordinator] verifyStep failed (non-fatal):', err?.message ?? err);
    }

    scheduleLearnStep({
      missionId: this.missionId,
      storeId: this.baseContext.storeId ?? this.baseContext.targetId ?? null,
      brief: String(goal ?? ''),
      verifyResult,
      artifacts,
      blackboard: this.blackboard,
    });

    return merged;
  }

  mergeResults() {
    const merged = {};
    for (const [taskId, entry] of this.results) {
      const settled = entry?.settled;
      if (settled?.status === 'fulfilled' && settled.value) {
        merged[taskId] = settled.value;
      }
    }
    return merged;
  }
}
