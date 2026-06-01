import { V1OrchestrationAgent } from './baseAgent.js';

export class PackageAgent extends V1OrchestrationAgent {
  static agentType = 'package';

  static agentName = 'package';

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
