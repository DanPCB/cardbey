/**
 * Template AI Text Service
 * Generates AI-powered text for template slots using OpenAI and template context
 */

import { openaiTextEngine } from '../ai/engines/openaiTextEngine.js';

/**
 * Parameters for generating text for a template slot
 */
export interface TemplateTextGenerationParams {
  slot: {
    id: string;
    label: string;
    type: string;
    description?: string;
  };
  aiContext?: {
    tone?: string;
    audience?: string;
    language?: string;
    styleHints?: string[];
    [key: string]: any;
  } | null;
  businessContext: {
    business: {
      name: string;
      description?: string | null;
      logoUrl?: string | null;
      address?: string | null;
      phone?: string | null;
    } | null;
  };
  language?: string;
}

/**
 * Generate text for a template slot using AI
 * 
 * Builds a prompt using slot metadata, AI context, and business context,
 * then calls OpenAI to generate appropriate text.
 * 
 * @param params - Generation parameters
 * @returns Generated text string, or null if generation fails
 */
export async function generateTextForSlot(
  params: TemplateTextGenerationParams
): Promise<string | null> {
  const { slot, aiContext, businessContext, language = 'en' } = params;

  // Skip if slot is not text/richtext type
  if (slot.type !== 'text' && slot.type !== 'richtext') {
    return null;
  }

  try {
    // Build system prompt with AI context
    const tone = aiContext?.tone || 'friendly';
    const audience = aiContext?.audience || 'general';
    const styleHints = aiContext?.styleHints || [];
    const styleHintText = styleHints.length > 0 
      ? ` Style: ${styleHints.join(', ')}.`
      : '';

    const systemPrompt = `You are a professional copywriter creating marketing content for a business.
Generate concise, engaging text that matches the requested tone (${tone}) and audience (${audience}).${styleHintText}
Keep it brief and suitable for visual design templates.`;

    // Build user prompt with slot and business context
    const businessName = businessContext.business?.name || 'the business';
    const businessDesc = businessContext.business?.description || '';
    const businessInfo = businessDesc 
      ? `${businessName} (${businessDesc})`
      : businessName;

    const userPrompt = `Generate text for a template slot labeled "${slot.label}".
${slot.description ? `Description: ${slot.description}\n` : ''}
Business context: ${businessInfo}
${businessContext.business?.address ? `Location: ${businessContext.business.address}\n` : ''}
${businessContext.business?.phone ? `Phone: ${businessContext.business.phone}\n` : ''}
Language: ${language === 'vi' ? 'Vietnamese' : 'English'}

Generate a short, engaging text (1-2 sentences max) that fits this slot and matches the business context.
Return only the text, no explanations or quotes.`;

    // Call OpenAI text engine
    const result = await openaiTextEngine.generateText({
      systemPrompt,
      userPrompt,
      temperature: 0.7, // Balanced creativity
      maxTokens: 150, // Keep it concise
    });

    const generatedText = result.text?.trim() || null;

    if (generatedText) {
      console.log(`[TemplateAI] Generated text for slot "${slot.id}": "${generatedText.substring(0, 50)}..."`);
    }

    return generatedText;
  } catch (error) {
    // AI failures should not block template instantiation
    console.warn(`[TemplateAI] Failed to generate text for slot "${slot.id}":`, error);
    return null;
  }
}

