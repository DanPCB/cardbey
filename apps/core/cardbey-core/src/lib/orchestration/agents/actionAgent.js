import { V1OrchestrationAgent } from './baseAgent.js';

export class ActionAgent extends V1OrchestrationAgent {
  static agentType = 'action';

  static agentName = 'action';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Action stub — no side effects in V1',
      action: { status: 'skipped', reason: 'v1_stub' },
    };
  }
}
