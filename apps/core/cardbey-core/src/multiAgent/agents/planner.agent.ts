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
        thinking: {
          type: 'enabled',
          reasoningEffort: ReasoningEffort.HIGH,
        },
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

      const systemPrompt = `You are a mission planner for Cardbey Performer.
Create detailed step-by-step plans for store setup and business missions.

CRITICAL RULES FOR MULTI-STORE SETUP:
When a user asks to set up multiple stores:
1. Check if store names are provided
2. Check if categories are provided
3. Check if specific locations are provided
4. If any are missing, create clarification steps FIRST
5. Do NOT proceed to creation until ALL fields are provided

Each step must be:
1. Clear and actionable
2. Include parameters for tool calls when needed
3. Include validation criteria
4. Declare dependencies between steps using step action names as keys in dependencies

Handle edge cases: missing location, duplicate store names, invalid categories.
Add validation points for business rules.

Output JSON only:
{
  "steps": [{"action": "...", "parameters": {}, "validation": "..."}],
  "requiredTools": ["create_store", "..."],
  "estimatedComplexity": "low" | "medium" | "high",
  "dependencies": {"step_action": ["prerequisite_action"]},
  "estimatedDuration": 120,
  "isClarification": false,
  "missingFields": []
}${campaignPlannerPromptExtension(input.message)}${plannerPromptExtension(input.message)}`;

      const userContent = `User request: ${input.message}\nContext: ${JSON.stringify(input.context ?? {})}`;

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
