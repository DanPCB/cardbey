import { V1OrchestrationAgent } from './baseAgent.js';

export class ResearchAgent extends V1OrchestrationAgent {
  static agentType = 'research';

  static agentName = 'research';

  buildResult(task) {
    const base = super.buildResult(task);
    const sk = this.context.storeKnowledge;
    return {
      ...base,
      summary: sk?.name
        ? `Research stub — context for ${sk.name} (V1)`
        : 'Research stub — market context placeholder (V1)',
      marketReport: {
        stub: true,
        highlights: ['Local V1 stub — no external research API'],
        goal: base.goal,
        storeName: sk?.name ?? null,
        category: sk?.category ?? null,
        enrichmentStatus: sk?.enrichmentStatus ?? null,
        ...(base.dataQualityWarning ? { warning: base.dataQualityWarning } : {}),
      },
    };
  }
}
