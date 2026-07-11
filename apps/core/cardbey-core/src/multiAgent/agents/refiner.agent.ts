/**
 * Refiner agent — improves response clarity and professionalism.
 */

import { BaseAgent } from './base.agent.js';
import {
  AgentType,
  type AgentConfig,
  ReasoningEffort,
} from '../types/agent.types.js';
import { loadAgentConfig } from '../config/agent.config.js';

export class Refiner extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super(
      AgentType.REFINER,
      {
        ...loadAgentConfig(AgentType.REFINER),
        thinking: {
          type: 'enabled',
          reasoningEffort: ReasoningEffort.MEDIUM,
        },
        temperature: 0.8,
        ...config,
      },
    );
  }

  async process(draftResponse: string): Promise<string> {
    return this.executeWithTrace(async () => {
      const systemPrompt = `You are a response refiner for Cardbey Performer.
Improve the draft response to be:
- Conversational and friendly
- Clear and actionable
- Professional but approachable
- Concise without losing important details

Return only the refined text — no JSON, no markdown fences.`;

      const { response } = await this.callDeepSeek([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Draft response:\n${draftResponse}` },
      ]);

      return this.extractContent(response).trim();
    }, 'refine_response');
  }
}
