import { V1OrchestrationAgent } from './baseAgent.js';

export class BriefAgent extends V1OrchestrationAgent {
  static agentType = 'brief';

  static agentName = 'brief';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Brief stub — campaign brief placeholder',
      brief: { stub: true, headline: base.goal || 'Campaign brief (V1 stub)' },
    };
  }
}
