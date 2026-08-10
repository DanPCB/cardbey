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
        // JSON reviews: keep thinking off and token budget tight for latency.
        thinking: {
          type: 'disabled',
          reasoningEffort: ReasoningEffort.LOW,
        },
        maxTokens: 768,
        temperature: 0.2,
        ...config,
      },
    );
  }

  async process(input: CriticInput): Promise<ReviewResult> {
    return this.executeWithTrace(async () => {
      const systemPrompt = `You are Cardbey's plan critic. Return concise JSON only.

Check for blocking gaps only: missing required fields, unsafe/invalid params, no create/confirm path.
Approve when the plan is executable; list at most 3 issues and 3 risks.
Do not invent long essays.

{"approved":true,"issues":[],"suggestions":[],"confidence":0.9,"risks":[]}${campaignCriticPromptExtension(input.originalMessage ?? '')}`;

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
