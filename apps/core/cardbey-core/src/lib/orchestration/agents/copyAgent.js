import { V1OrchestrationAgent } from './baseAgent.js';

export class CopyAgent extends V1OrchestrationAgent {
  static agentType = 'copy';

  static agentName = 'copy';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Copy stub — platform copy placeholder',
      copy: { stub: true, variants: [] },
    };
  }
}
