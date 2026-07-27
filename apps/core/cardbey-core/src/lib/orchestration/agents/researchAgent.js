import { V1OrchestrationAgent } from './baseAgent.js';

export class ResearchAgent extends V1OrchestrationAgent {
  static agentType = 'research';

  static agentName = 'research';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Research stub — market context placeholder (V1)',
      marketReport: {
        stub: true,
        highlights: ['Local V1 stub — no external research API'],
        goal: base.goal,
      },
    };
  }
}
