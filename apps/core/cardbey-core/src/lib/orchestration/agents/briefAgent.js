import { V1OrchestrationAgent } from './baseAgent.js';
import {
  emitAgentEvent,
  emitSse,
  formatStoreSection,
} from './liveAgentHelpers.js';
import { dispatchCampaignTool, unwrapToolOutput } from './campaignAgentLive.js';

export class BriefAgent extends V1OrchestrationAgent {
  static agentType = 'brief';

  static agentName = 'brief';

  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const missionId = this.context.missionId ?? null;
    const goal = String(
      task?.goal ?? task?.description ?? this.context.brief ?? this.context.goal ?? '',
    ).trim();
    const sk = this.context.storeKnowledge;

    emitSse(this.context, { agentName: 'BriefAgent', status: 'running', missionId });

    try {
      const storeId = this.context.storeId ?? this.context.targetId ?? sk?.id ?? null;
      const objective =
        goal ||
        (sk?.name
          ? `Launch a marketing campaign for ${sk.name}`
          : 'Launch a marketing campaign for this store');

      const dispatched = await dispatchCampaignTool(
        'create_campaign_brief',
        {
          storeId,
          objective,
          targetAudience: sk?.category
            ? `Local ${sk.category} customers${sk.suburb ? ` in ${sk.suburb}` : ''}`
            : 'local customers',
          tone: 'friendly',
          duration: '7 days',
          offer: null,
          storeContext: formatStoreSection(sk),
        },
        { ...this.context, goal: objective },
      );

      const output = unwrapToolOutput(dispatched);
      const brief = output?.brief;
      if (!brief || typeof brief !== 'object') {
        throw new Error(
          `create_campaign_brief ${dispatched?.status ?? 'failed'}: ${dispatched?.blocker?.message || dispatched?.error?.message || 'no brief'}`,
        );
      }

      const result = {
        type: 'brief',
        brief,
        summary: `Campaign brief: ${brief.objective}`,
        stub: false,
      };

      await emitAgentEvent(this.context, 'brief:complete', {
        agentName: 'BriefAgent',
        output: result,
        missionId,
        completedAt: new Date().toISOString(),
      });
      emitSse(this.context, {
        agentName: 'BriefAgent',
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
      console.warn('[BriefAgent] live brief failed, using stub:', err?.message ?? err);
      return super.execute(task);
    }
  }

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Brief stub — campaign brief placeholder',
      brief: { stub: true, headline: base.goal || 'Campaign brief (V1 stub)' },
    };
  }
}
