import { V1OrchestrationAgent } from './baseAgent.js';

export class GraphicsAgent extends V1OrchestrationAgent {
  static agentType = 'graphics';

  static agentName = 'graphics';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Graphics stub — poster placeholder',
      graphics: { stub: true, posterUrl: null },
    };
  }
}
