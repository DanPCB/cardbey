import { V1OrchestrationAgent } from './baseAgent.js';
import {
  emitAgentEvent,
  emitSse,
} from './liveAgentHelpers.js';
import {
  buildCampaignPackageUi,
  dispatchCampaignTool,
  loadCampaignPriors,
  unwrapToolOutput,
} from './campaignAgentLive.js';

export class PackageAgent extends V1OrchestrationAgent {
  static agentType = 'package';

  static agentName = 'package';

  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;
    const missionId = this.context.missionId ?? null;
    const storeId = this.context.storeId ?? this.context.targetId ?? null;
    const goal = String(
      task?.goal ?? task?.description ?? this.context.goal ?? this.context.brief ?? '',
    ).trim();

    emitSse(this.context, { agentName: 'PackageAgent', status: 'running', missionId });

    try {
      const priors = await loadCampaignPriors(this.context, task);
      let artifact = null;

      if (priors.brief && priors.copy && priors.graphics.length > 0) {
        const dispatched = await dispatchCampaignTool(
          'package_campaign_artifact',
          {
            storeId,
            brief: priors.brief,
            graphics: priors.graphics,
            copy: priors.copy,
            slideshowUrl: priors.slideshowUrl,
          },
          { ...this.context, goal },
        );
        const output = unwrapToolOutput(dispatched);
        artifact = output?.artifact ?? null;
        // Incomplete package is blocked by the tool — still assemble a UI package from priors.
        if (!artifact && dispatched?.status === 'blocked') {
          console.warn(
            '[PackageAgent] package_campaign_artifact blocked, assembling from priors:',
            dispatched?.blocker?.message || dispatched?.reason,
          );
        }
      }

      const pkg = buildCampaignPackageUi({
        goal,
        storeId,
        missionId,
        brief: priors.brief,
        graphics: priors.graphics,
        copy: priors.copy,
        qa: priors.qa,
        slideshowUrl: priors.slideshowUrl,
        artifact,
      });

      if (!pkg.keyMessage && !pkg.assets?.poster && !Object.keys(pkg.copy ?? {}).length) {
        throw new Error('No campaign priors available to package');
      }

      await emitAgentEvent(this.context, 'package:complete', {
        agentName: 'PackageAgent',
        output: pkg,
        missionId,
        completedAt: new Date().toISOString(),
      });
      emitSse(this.context, {
        agentName: 'PackageAgent',
        status: 'complete',
        summary: `Package: ${pkg.campaignName}`,
        missionId,
      });

      return {
        taskId,
        agentType,
        result: pkg,
        summary: `Campaign package assembled: ${pkg.campaignName}`,
        confidence: pkg.readyToPublish ? 0.9 : 0.65,
        latencyMs: Math.max(0, Date.now() - started),
      };
    } catch (err) {
      console.warn('[PackageAgent] live package failed, using stub:', err?.message ?? err);
      return super.execute(task);
    }
  }

  buildResult(task) {
    const base = super.buildResult(task);
    const ctx = this.context;
    return {
      ...base,
      summary: 'Package stub — campaign package shell',
      campaignName: base.goal || 'Campaign (V1 stub)',
      storeId: ctx.storeId ?? ctx.targetId ?? null,
      missionId: ctx.missionId ?? null,
      stub: true,
    };
  }
}
