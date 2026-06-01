import { V1OrchestrationAgent } from './baseAgent.js';

export class SlideshowAgent extends V1OrchestrationAgent {
  static agentType = 'slideshow';

  static agentName = 'slideshow';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Slideshow stub — slides placeholder',
      slideshow: { stub: true, slideCount: 0 },
    };
  }
}
