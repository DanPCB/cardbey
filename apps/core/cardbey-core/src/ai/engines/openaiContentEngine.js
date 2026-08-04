/**
 * OpenAI Content Engine Adapter (Image Generation)
 * Phase 4: routes through llmGateway.generateImage when IMAGE_GEN / gateway is on.
 */

import OpenAI from 'openai';
import { Features } from '../../config/features.js';
import { generateImage } from '../../lib/llm/llmGateway.ts';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000,
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

const IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL?.trim() || process.env.DALLE_MODEL?.trim() || 'dall-e-3';

export const openaiContentEngine = {
  name: 'openai-content-v1',

  async generateImage({ prompt, style = 'photo', size = 'square' }) {
    const sizeMap = {
      square: '1024x1024',
      landscape: '1792x1024',
      portrait: '1024x1792',
    };
    const dallESize = sizeMap[size] || '1024x1024';

    let enhancedPrompt = prompt;
    if (style === 'illustration') {
      enhancedPrompt = `Digital illustration, ${prompt}, clean vector style, modern design`;
    } else if (style === 'flat') {
      enhancedPrompt = `Flat design, ${prompt}, minimal, modern, clean`;
    } else if (style === 'poster') {
      enhancedPrompt = `Poster design, ${prompt}, bold typography, high contrast, eye-catching`;
    } else {
      enhancedPrompt = `High-quality photograph, ${prompt}, professional lighting, sharp focus`;
    }

    if (Features.image.useGateway) {
      try {
        const result = await generateImage({
          prompt: enhancedPrompt,
          provider: Features.image.defaultProvider || 'dalle',
          model: IMAGE_MODEL,
          size: dallESize,
          count: 1,
          purpose: 'openai_content_engine',
        });
        const imageUrl = result.images?.[0];
        if (!imageUrl) {
          throw new Error('Gateway did not return an image URL');
        }
        return {
          imageUrl,
          raw: {
            model: result.model || IMAGE_MODEL,
            size: dallESize,
            style,
            provider: result.provider,
          },
        };
      } catch (error) {
        console.error('[OpenAI Content Engine] Gateway error:', error);
        throw new Error(`Image generation failed: ${error.message}`);
      }
    }

    if (!HAS_AI) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await openai.images.generate({
        model: IMAGE_MODEL,
        prompt: enhancedPrompt,
        size: dallESize,
        quality: 'standard',
        n: 1,
      });

      const imageUrl = response.data[0]?.url;
      if (!imageUrl) {
        throw new Error('OpenAI did not return an image URL');
      }

      return {
        imageUrl,
        raw: {
          model: IMAGE_MODEL,
          size: dallESize,
          style,
          responseId: response.data[0]?.revised_prompt,
        },
      };
    } catch (error) {
      console.error('[OpenAI Content Engine] Error:', error);
      throw new Error(`Image generation failed: ${error.message}`);
    }
  },
};
