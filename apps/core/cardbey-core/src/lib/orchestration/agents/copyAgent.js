import { V1OrchestrationAgent } from './baseAgent.js';
import {
  emitAgentEvent,
  emitSse,
  findPriorAgentResult,
} from './liveAgentHelpers.js';
import {
  dispatchCampaignTool,
  pickPriorField,
  unwrapToolOutput,
} from './campaignAgentLive.js';

export class CopyAgent extends V1OrchestrationAgent {
  static agentType = 'copy';

  static agentName = 'copy';

  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const missionId = this.context.missionId ?? null;
    const storeId = this.context.storeId ?? this.context.targetId ?? null;

    emitSse(this.context, { agentName: 'CopyAgent', status: 'running', missionId });

    try {
      const briefPrior = await findPriorAgentResult(this.context, task, 'brief');
      const brief = pickPriorField(briefPrior, 'brief') ?? {
        objective: String(task?.goal ?? task?.description ?? this.context.goal ?? '').trim(),
        tone: 'friendly',
        targetAudience: 'local customers',
      };

      const dispatched = await dispatchCampaignTool(
        'generate_campaign_copy',
        {
          storeId,
          brief,
          tone: brief.tone ?? 'friendly',
          platforms: ['instagram', 'facebook', 'tiktok'],
        },
        { ...this.context, goal: brief.objective },
      );

      const output = unwrapToolOutput(dispatched);
      const copy = output?.copy;
      if (!copy || typeof copy !== 'object' || !String(copy.headline ?? '').trim()) {
        throw new Error(
          `generate_campaign_copy ${dispatched?.status ?? 'failed'}: ${dispatched?.blocker?.message || dispatched?.error?.message || 'no copy'}`,
        );
      }

      const result = {
        type: 'copy',
        copy,
        summary: `Copy ready: ${copy.headline}`,
        stub: false,
      };

      await emitAgentEvent(this.context, 'copy:complete', {
        agentName: 'CopyAgent',
        output: result,
        missionId,
        completedAt: new Date().toISOString(),
      });
      emitSse(this.context, {
        agentName: 'CopyAgent',
        status: 'complete',
        summary: result.summary,
        missionId,
      });

      return {
        taskId,
        agentType,
        result,
        summary: result.summary,
        confidence: 0.85,
        latencyMs: Math.max(0, Date.now() - started),
      };
    } catch (err) {
      console.warn('[CopyAgent] live copy failed, using stub:', err?.message ?? err);
      return super.execute(task);
    }
  }

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Copy stub — platform copy placeholder',
      copy: { stub: true, variants: [] },
    };
  }
}
