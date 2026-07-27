/**
 * OpenAI Content Engine Adapter (Image Generation)
 * Implements ContentEngine interface using OpenAI DALL-E API
 */

import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000, // Longer timeout for image generation
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

export const openaiContentEngine = {
  name: 'openai-content-v1',

  async generateImage({ prompt, style = 'photo', size = 'square' }) {
    if (!HAS_AI) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Map size to DALL-E sizes
      const sizeMap = {
        square: '1024x1024',
        landscape: '1792x1024',
        portrait: '1024x1792',
      };

      const dallESize = sizeMap[size] || '1024x1024';

      // Enhance prompt with style
      let enhancedPrompt = prompt;
      if (style === 'illustration') {
        enhancedPrompt = `Digital illustration, ${prompt}, clean vector style, modern design`;
      } else if (style === 'flat') {
        enhancedPrompt = `Flat design, ${prompt}, minimal, modern, clean`;
      } else if (style === 'poster') {
        enhancedPrompt = `Poster design, ${prompt}, bold typography, high contrast, eye-catching`;
      } else {
        // photo style
        enhancedPrompt = `High-quality photograph, ${prompt}, professional lighting, sharp focus`;
      }

      const response = await openai.images.generate({
        model: 'dall-e-3',
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
          model: 'dall-e-3',
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


