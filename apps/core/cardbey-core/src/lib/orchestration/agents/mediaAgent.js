import { V1OrchestrationAgent } from './baseAgent.js';

/** V1 stub — optional media specialist (not wired in coordinator waves yet). */
export class MediaAgent extends V1OrchestrationAgent {
  static agentType = 'media';

  static agentName = 'media';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Media stub — hero/media placeholder',
      media: { stub: true, assets: [] },
    };
  }
}
