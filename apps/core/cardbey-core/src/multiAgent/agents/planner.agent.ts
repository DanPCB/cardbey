/**
 * Planner agent — creates step-by-step mission plans for store setup.
 */

import { randomUUID } from 'node:crypto';
import { BaseAgent } from './base.agent.js';
import {
  AgentType,
  type AgentConfig,
  type MissionPlan,
  ReasoningEffort,
} from '../types/agent.types.js';
import { loadAgentConfig } from '../config/agent.config.js';
import {
  PlanSchema,
  extractJsonFromContent,
  safeParseJson,
} from '../utils/validation.js';
import { campaignPlannerPromptExtension } from '../../lib/multiAgent/campaignPlanHelpers.js';
import {
  extractMultiStoreInfo,
  generateClarificationPlan,
  isMultiStoreRequest,
  plannerPromptExtension,
} from '../../lib/multiAgent/multiStorePlanHelpers.js';

export interface PlannerInput {
  message: string;
  context?: Record<string, unknown>;
}

export class Planner extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super(
      AgentType.PLANNER,
      {
        ...loadAgentConfig(AgentType.PLANNER),
        // JSON plans: keep thinking off and token budget tight for latency.
        thinking: {
          type: 'disabled',
          reasoningEffort: ReasoningEffort.LOW,
        },
        maxTokens: 1024,
        temperature: 0.3,
        ...config,
      },
    );
  }

  async process(input: PlannerInput): Promise<MissionPlan> {
    return this.executeWithTrace(async () => {
      if (isMultiStoreRequest(input.message)) {
        const extractedInfo = extractMultiStoreInfo(input.message);
        if (extractedInfo.missingFields.length > 0) {
          return generateClarificationPlan(extractedInfo, input.message);
        }
      }

      const systemPrompt = `You are Cardbey's mission planner. Emit a short actionable plan as JSON only.

Rules:
- Prefer 3–6 steps. Each step needs action, parameters, validation.
- Multi-store: clarify missing names/categories/locations before create.
- dependencies keys are step action names.
- Handle missing location, duplicates, invalid categories briefly.

Schema:
{"steps":[{"action":"...","parameters":{},"validation":"..."}],"requiredTools":["create_store"],"estimatedComplexity":"low"|"medium"|"high","dependencies":{},"estimatedDuration":120,"isClarification":false,"missingFields":[]}${campaignPlannerPromptExtension(input.message)}${plannerPromptExtension(input.message)}`;

      const userContent = `Request: ${input.message}\nContext: ${JSON.stringify(input.context ?? {})}`;

      const { response } = await this.callDeepSeek(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { responseFormat: { type: 'json_object' } },
      );

      const content = extractJsonFromContent(this.extractContent(response));
      const parsed = safeParseJson(content, PlanSchema, 'Planner');

      const steps = parsed.steps.map((step) => ({
        id: randomUUID(),
        action: step.action,
        parameters: step.parameters,
        dependencies: step.dependencies,
        validation: step.validation,
      }));

      return {
        steps,
        requiredTools: parsed.requiredTools,
        estimatedComplexity: parsed.estimatedComplexity,
        dependencies: parsed.dependencies,
        estimatedDuration: parsed.estimatedDuration,
      };
    }, 'create_plan');
  }
}
