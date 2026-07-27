/**
 * Critic agent — reviews and validates mission plans.
 */

import { BaseAgent } from './base.agent.js';
import {
  AgentType,
  type AgentConfig,
  type MissionPlan,
  type ReviewResult,
  ReasoningEffort,
} from '../types/agent.types.js';
import { loadAgentConfig } from '../config/agent.config.js';
import {
  ReviewSchema,
  extractJsonFromContent,
  safeParseJson,
} from '../utils/validation.js';
import { campaignCriticPromptExtension } from '../../lib/multiAgent/campaignPlanHelpers.js';

export interface CriticInput {
  plan: MissionPlan;
  originalMessage?: string;
}

export class Critic extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super(
      AgentType.CRITIC,
      {
        ...loadAgentConfig(AgentType.CRITIC),
        thinking: {
          type: 'enabled',
          reasoningEffort: ReasoningEffort.HIGH,
        },
        ...config,
      },
    );
  }

  async process(input: CriticInput): Promise<ReviewResult> {
    return this.executeWithTrace(async () => {
      const systemPrompt = `You are a mission plan critic for Cardbey Performer.
Review plans thoroughly for:
- Missing steps (verification, publishing, error handling)
- Risks (data loss, invalid parameters, compliance)
- Optimization opportunities (parallelization, redundant steps)
- Validation completeness

Be strict on invalid or incomplete plans (e.g., missing location, empty store name).

Respond with JSON only:
{
  "approved": true,
  "issues": ["..."],
  "suggestions": ["..."],
  "confidence": 0.9,
  "risks": ["..."]
}${campaignCriticPromptExtension(input.originalMessage ?? '')}`;

      const userContent = JSON.stringify({
        plan: input.plan,
        originalMessage: input.originalMessage,
      });

      const { response } = await this.callDeepSeek(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { responseFormat: { type: 'json_object' } },
      );

      const content = extractJsonFromContent(this.extractContent(response));
      return safeParseJson(content, ReviewSchema, 'Critic');
    }, 'review_plan');
  }
}
