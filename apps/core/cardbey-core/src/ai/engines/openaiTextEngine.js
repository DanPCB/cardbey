/**
 * OpenAI Text Engine Adapter
 * Implements TextEngine interface using OpenAI Chat Completions API
 */

import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

export const openaiTextEngine = {
  name: 'openai-text-v1',

  async generateText({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 1000 }) {
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
        model: 'gpt-4o-mini',
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const text = response.choices[0]?.message?.content || '';

      return {
        text,
        raw: {
          model: 'gpt-4o-mini',
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


