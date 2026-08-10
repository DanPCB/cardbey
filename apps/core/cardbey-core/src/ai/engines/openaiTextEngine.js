/**
 * OpenAI Text Engine Adapter
 * Phase 4: routes through llmGateway when USE_LLM_GATEWAY is on.
 * Implements TextEngine interface for legacy getTextEngine() callers.
 */

import OpenAI from 'openai';
import { Features } from '../../config/features.js';
import { llmGateway } from '../../lib/llm/llmGateway.ts';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

function resolveTextModel() {
  return (
    process.env.OPENAI_TEXT_ENGINE_MODEL?.trim() ||
    Features.llm.fallbackModel ||
    'gpt-4o-mini'
  );
}

export const openaiTextEngine = {
  name: 'openai-text-v1',

  async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 1000 }) {
    const model = resolveTextModel();

    if (Features.llm.useGateway) {
      if (!Features.llm.available) {
        throw new Error('No LLM provider configured for text engine');
      }
      try {
        const result = await llmGateway.complete({
          purpose: 'openai_text_engine',
          tenantKey: 'ai_engines',
          system: systemPrompt,
          prompt: userPrompt,
          provider: Features.llm.fallbackProvider || 'openai',
          model,
          temperature,
          maxTokens,
          responseFormat: 'text',
        });
        return {
          text: result.text || '',
          raw: {
            model: result.model || model,
            usage: {
              prompt_tokens: result.inputTokens,
              completion_tokens: result.outputTokens,
            },
            provider: result.provider || Features.llm.fallbackProvider,
          },
        };
      } catch (error) {
        console.error('[OpenAI Text Engine] Gateway error:', error);
        throw new Error(`Text generation failed: ${error.message}`);
      }
    }

    if (!HAS_AI) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: userPrompt });

      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const text = response.choices[0]?.message?.content || '';

      return {
        text,
        raw: {
          model,
          usage: response.usage,
          responseId: response.id,
        },
      };
    } catch (error) {
      console.error('[OpenAI Text Engine] Error:', error);
      throw new Error(`Text generation failed: ${error.message}`);
    }
  },
};
