import { V1OrchestrationAgent } from './baseAgent.js';

export class QAAgent extends V1OrchestrationAgent {
  static agentType = 'qa';

  static agentName = 'qa';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'QA stub — passed (V1 deterministic)',
      qa: { passed: true, stub: true, checks: ['v1-stub'] },
      confidence: 0.8,
    };
  }
}
