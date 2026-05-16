/**
 * OpenAI Vision Engine Adapter
 * Implements VisionEngine interface using OpenAI Vision API
 */

import OpenAI from 'openai';
import type { VisionEngine } from './types.js';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

export const openaiVisionEngine: VisionEngine = {
  name: 'openai-vision-v1',

  async analyzeImage({ imageUrl, imageBase64, task }) {
    if (!HAS_AI) {
      throw new Error('OpenAI API key not configured');
    }

    if (!imageUrl && !imageBase64) {
      throw new Error('Either imageUrl or imageBase64 must be provided');
    }

    try {
      // Build prompt based on task
      let prompt = 'Extract all text from this image. Return only the raw text, line by line, exactly as it appears.';
      
      if (task === 'loyalty_card') {
        prompt = 'Extract text from this loyalty card image. Focus on stamp count, reward description, and card title. Return the text exactly as it appears.';
      } else if (task === 'menu') {
        prompt = 'Extract all text from this menu image. Return only the raw text, line by line, exactly as it appears. Do not add any formatting or interpretation.';
      } else if (task === 'shopfront') {
        prompt = 'Extract text and describe visual elements from this shopfront image. Return text content and any visible signage or displays.';
      }

      // Build image content
      const imageContent: any = imageUrl
        ? { type: 'image_url', image_url: { url: imageUrl } }
        : { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } };

      const response = await openai!.chat.completions.create({
        model: 'gpt-4o', // Vision-capable model
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              imageContent,
            ],
          },
        ],
        max_tokens: 2000,
      });

      const text = response.choices[0]?.message?.content || '';

      return {
        text,
        raw: {
          model: 'gpt-4o',
          usage: response.usage,
          responseId: response.id,
        },
      };
    } catch (error: any) {
      console.error('[OpenAI Vision Engine] Error:', error);
      throw new Error(`Vision analysis failed: ${error.message}`);
    }
  },
};


