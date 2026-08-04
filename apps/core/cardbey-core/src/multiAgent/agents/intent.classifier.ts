/**
 * Intent classification agent — routes user messages to mission handlers.
 * Phase 2: LLM calls via BaseAgent → llmGateway; emits unifiedIntent (canonical taxonomy).
 */

import { BaseAgent } from './base.agent.js';
import {
  AgentType,
  type AgentConfig,
  type IntentResult,
  ReasoningEffort,
} from '../types/agent.types.js';
import { loadAgentConfig } from '../config/agent.config.js';
import {
  IntentSchema,
  extractJsonFromContent,
  safeParseJson,
} from '../utils/validation.js';
import { enrichIntentWithMultiStore } from '../../lib/multiAgent/multiStorePlanHelpers.js';
import { fromMultiAgentIntent } from '../../lib/intent/unifiedIntent.ts';

export class IntentClassifier extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super(
      AgentType.INTENT_CLASSIFIER,
      {
        ...loadAgentConfig(AgentType.INTENT_CLASSIFIER),
        thinking: {
          type: 'enabled',
          reasoningEffort: ReasoningEffort.MEDIUM,
        },
        ...config,
      },
    );
  }

  async process(userMessage: string): Promise<IntentResult> {
    return this.executeWithTrace(async () => {
      const systemPrompt = `You are an intent classifier for Cardbey Performer.
Classify user requests into exactly one of these categories:
- STORE_SETUP: Creating a new store (e.g., "I want to open a store", "Create a new store") → unified: create_store
- STORE_UPDATE: Updating existing store (e.g., "Change my store location", "Update store name") → unified: update_store
- STORE_QUERY: Asking about store details (e.g., "What's my store ID?", "Show me store info") → unified: view_store
- MISSION_PLANNING: Complex multi-step mission (e.g., "Set up 3 stores in different cities") → unified: create_store
- GENERAL_QUERY: General questions (e.g., "What categories do you have?") → unified: general_chat
- SUPPORT: Help requests (e.g., "I need help", "I'm stuck") → unified: get_help

For multi-store requests, classify as MISSION_PLANNING and extract:
1. Number of stores (store_count)
2. Store names when provided (names)
3. Locations when provided (locations) — not vague phrases like "different cities"
4. Categories when provided (categories)

If ANY required multi-store fields are missing, set needs_clarification to true and list missing_fields.

Extract relevant entities (store name, location, category) when present.

Respond with JSON only:
{"intent": "CATEGORY", "confidence": 0.95, "entities": {}, "needs_clarification": false, "missing_fields": []}`;

      const { response } = await this.callDeepSeek(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        { responseFormat: { type: 'json_object' }, cacheKey: userMessage },
      );

      const content = extractJsonFromContent(this.extractContent(response));
      const parsed = safeParseJson(content, IntentSchema, 'IntentClassifier');

      const enriched = enrichIntentWithMultiStore(userMessage, {
        intent: parsed.intent,
        confidence: parsed.confidence,
        entities: parsed.entities,
        needsClarification: parsed.needs_clarification,
        missingFields: parsed.missing_fields,
      });

      return {
        ...enriched,
        unifiedIntent: fromMultiAgentIntent(enriched.intent),
      };
    }, 'classify_intent');
  }
}
