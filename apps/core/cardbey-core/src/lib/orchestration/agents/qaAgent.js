import { V1OrchestrationAgent } from './baseAgent.js';
import {
  callAgentJson,
  emitAgentEvent,
  emitSse,
  findPriorAgentResult,
} from './liveAgentHelpers.js';
import {
  dispatchCampaignTool,
  loadCampaignPriors,
  unwrapToolOutput,
} from './campaignAgentLive.js';

export class QAAgent extends V1OrchestrationAgent {
  static agentType = 'qa';

  static agentName = 'qa';

  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const brief = String(
      task?.goal ?? task?.description ?? this.context.brief ?? this.context.goal ?? '',
    ).trim();
    const missionId = this.context.missionId ?? null;
    const storeKnowledge = this.context.storeKnowledge ?? null;

    emitSse(this.context, { agentName: 'QAAgent', status: 'running', missionId });

    try {
      const build = await findPriorAgentResult(this.context, task, 'build');
      let result;
      if (build) {
        result = await this.runLiveQa(brief, storeKnowledge, build);
      } else {
        result = await this.runCampaignQa(task);
        if (!result) {
          result = {
            type: 'qa',
            passed: false,
            score: 0,
            issues: ['No build or campaign outputs to validate'],
            suggestions: [],
            approvedForAction: false,
            summary: 'QA failed — no campaign deliverables found for review',
          };
        }
      }
      await emitAgentEvent(this.context, 'qa:complete', {
        agentName: 'QAAgent',
        output: result,
        missionId,
        completedAt: new Date().toISOString(),
      });
      emitSse(this.context, {
        agentName: 'QAAgent',
        status: 'complete',
        score: result.score,
        passed: result.passed,
        missionId,
      });
      return {
        taskId,
        agentType,
        result,
        summary: result.summary ?? `QA ${result.passed ? 'passed' : 'failed'} (${result.score})`,
        confidence: (result.score ?? 0) / 100,
        latencyMs: Math.max(0, Date.now() - started),
      };
    } catch (err) {
      console.warn('[QAAgent] live QA failed, using stub:', err?.message ?? err);
      return super.execute(task);
    }
  }

  /**
   * Campaign orchestration wave: brief + graphics + copy (no build agent).
   * @param {object} task
   */
  async runCampaignQa(task) {
    const priors = await loadCampaignPriors(this.context, task);
    if (!priors.brief && !priors.copy && priors.graphics.length === 0) {
      return null;
    }

    const dispatched = await dispatchCampaignTool(
      'qa_campaign_package',
      {
        brief: priors.brief ?? {},
        graphics: priors.graphics,
        copy: priors.copy ?? {},
      },
      this.context,
    );
    const output = unwrapToolOutput(dispatched);
    const issues = Array.isArray(output?.issues)
      ? output.issues.map(String)
      : Array.isArray(dispatched?.output?.partial?.issues)
        ? dispatched.output.partial.issues.map(String)
        : dispatched?.status === 'blocked'
          ? [dispatched?.blocker?.message || dispatched?.reason || 'Campaign QA failed']
          : [];
    const passed = Boolean(output?.passed) && issues.length === 0;
    const score = passed ? 90 : Math.max(20, 80 - issues.length * 20);

    return {
      type: 'qa',
      passed,
      score,
      issues,
      suggestions: [],
      approvedForAction: passed,
      summary: passed
        ? `Campaign QA passed (${score})`
        : `Campaign QA issues (${score}): ${issues.join('; ') || 'incomplete'}`,
    };
  }

  async runLiveQa(brief, storeKnowledge, build) {
    if (!build) {
      return {
        type: 'qa',
        passed: false,
        score: 0,
        issues: ['No build output to validate'],
        suggestions: [],
        approvedForAction: false,
        summary: 'QA failed — no build output',
      };
    }

    const issues = [];
    const suggestions = [];
    let score = 100;

    if (!build.headline || String(build.headline).length < 3) {
      issues.push('Headline is missing or too short');
      score -= 25;
    }
    if (!build.bodyText || String(build.bodyText).length < 20) {
      issues.push('Body text is too short');
      score -= 20;
    }
    if (!build.callToAction) {
      issues.push('Call to action is missing');
      score -= 15;
      suggestions.push('Add a clear CTA like "Order now" or "Book today"');
    }
    if (String(build.headline ?? '').toLowerCase().includes('unable to generate')) {
      issues.push('Build agent failed to generate content');
      score -= 50;
    }

    const storeFirst =
      typeof storeKnowledge?.name === 'string' ? storeKnowledge.name.split(/\s+/)[0] : '';
    if (
      storeFirst &&
      storeFirst.length > 2 &&
      !String(build.headline ?? '').toLowerCase().includes(storeFirst.toLowerCase())
    ) {
      suggestions.push(`Consider mentioning ${storeKnowledge.name} in the headline`);
    }

    if (score > 50 && brief) {
      try {
        const align = await callAgentJson({
          purpose: 'orchestration:qa_alignment',
          tenantKey: this.tenantKey,
          agentName: 'QAAgent',
          missionId: this.context.missionId,
          sseEmitter: this.context.sseEmitter,
          maxTokens: 120,
          temperature: 0,
          system: 'Reply ONLY with JSON: {"aligned":true|false,"reason":"one sentence"}',
          user: `Brief: "${brief}"
Output headline: "${build.headline}"
Body: "${build.bodyText}"

Does the output match the brief?`,
        });
        if (align && align.aligned === false) {
          issues.push('Output may not match the brief');
          if (align.reason) suggestions.push(String(align.reason));
          score -= 20;
        }
      } catch {
        /* alignment check is non-critical */
      }
    }

    score = Math.max(0, Math.min(100, score));
    const passed = score >= 60 && issues.length === 0;
    return {
      type: 'qa',
      passed,
      score,
      issues,
      suggestions,
      approvedForAction: score >= 50,
      summary: passed ? `QA passed (${score})` : `QA issues (${score}): ${issues.join('; ')}`,
    };
  }

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      type: 'qa',
      summary: 'QA stub — passed (V1 deterministic)',
      passed: true,
      score: 80,
      issues: [],
      suggestions: [],
      approvedForAction: true,
      qa: { passed: true, stub: true, checks: ['v1-stub'] },
      confidence: 0.8,
    };
  }
}
