import { V1OrchestrationAgent } from './baseAgent.js';

export class BuildAgent extends V1OrchestrationAgent {
  static agentType = 'build';

  static agentName = 'build';

  buildResult(task) {
    const base = super.buildResult(task);
    const ctx = this.context;
    return {
      ...base,
      summary: 'Build stub — store draft handled by structured_store_build step',
      structured_store_build: {
        ok: true,
        stub: true,
        businessName:
          (typeof ctx.businessName === 'string' && ctx.businessName.trim()) ||
          (typeof ctx.storeName === 'string' && ctx.storeName.trim()) ||
          base.goal,
        storeId: ctx.storeId ?? ctx.targetId ?? null,
        missionId: ctx.missionId ?? null,
      },
    };
  }
}
