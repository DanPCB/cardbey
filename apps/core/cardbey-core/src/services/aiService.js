/**
 * AI Service - content generation for the studio
 * Phase 0: text generation routes through llmGateway by default.
 */

import OpenAI from 'openai';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { llmGateway } from '../lib/llm/llmGateway.ts';
import { deprecatedOpenAIChatCompletion } from '../lib/llm/directOpenAICall.js';
import { Features } from '../config/features.js';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 second timeout
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);
/** Text/LLM availability (gateway can use Anthropic/DeepSeek/xAI without OpenAI). */
function hasAiText() {
  return Features.llm.useGateway ? Features.llm.available : HAS_OPENAI;
}
/** Image generation still requires OpenAI. */
const HAS_AI = HAS_OPENAI;

/**
 * Shared text completion — gateway by default, deprecated direct OpenAI on rollback.
 * @param {object} opts
 * @param {string} opts.purpose
 * @param {string} opts.system
 * @param {string} opts.user
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {'text'|'json'} [opts.responseFormat]
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.caller]
 */
async function completeText({
  purpose,
  system,
  user,
  temperature = 0.7,
  maxTokens = 500,
  responseFormat = 'text',
  timeoutMs,
  caller = 'aiService',
}) {
  if (Features.llm.useGateway) {
    if (!Features.llm.available) {
      throw new Error('AI service is not available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.');
    }
    const result = await llmGateway.complete({
      purpose,
      tenantKey: 'ai-service',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      provider: Features.llm.defaultProvider,
      model: Features.llm.defaultModel,
      temperature,
      maxTokens,
      responseFormat,
      ...(timeoutMs ? { timeoutMs } : {}),
    });
    return (result.text ?? result.content ?? '').trim();
  }

  if (!HAS_OPENAI) {
    throw new Error('AI service is not available. Please configure OPENAI_API_KEY.');
  }
  const response = await deprecatedOpenAIChatCompletion(
    openai,
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: maxTokens,
    },
    caller,
  );
  return response.choices[0]?.message?.content?.trim() || '';
}

// Constants
const MAX_PROMPT_LENGTH = 2000; // Maximum prompt length for safety
const AI_TIMEOUT_MS = 30000; // 30 seconds timeout
const IMAGE_DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds for image downloads

/**
 * Generate design suggestions based on studio snapshot
 */
export async function generateDesignSuggestions(snapshot, lastEvent) {
  if (!hasAiText()) {
    return null; // Fallback to mock suggestions
  }

  try {
    const elements = snapshot.elements || [];
    const selectedIds = snapshot.selectedIds || [];
    const selectedElements = elements.filter(el => selectedIds.includes(el.id));
    const targetElement = selectedElements[0] || elements[0];

    if (!targetElement) {
      return null;
    }

    const context = {
      totalElements: elements.length,
      selectedCount: selectedIds.length,
      targetKind: targetElement.kind,
      targetText: targetElement.text?.substring(0, 100),
      targetWidth: targetElement.width,
      targetHeight: targetElement.height,
      exportFormat: snapshot.exportFormat,
      lastEvent: lastEvent?.event,
    };

    const prompt = `You are a design assistant for a digital signage content studio. Analyze this design context and provide 2-3 actionable suggestions.

Context:
- Total elements: ${context.totalElements}
- Selected element: ${context.targetKind}${context.targetText ? ` with text "${context.targetText}"` : ''}
- Element size: ${context.targetWidth || 'auto'} x ${context.targetHeight || 'auto'}
- Export format: ${context.exportFormat || 'not set'}
- Last action: ${context.lastEvent || 'none'}

Provide suggestions in JSON format:
{
  "suggestions": [
    {
      "label": "Short action label",
      "reason": "Why this helps",
      "action": "patch|set",
      "payload": {...}
    }
  ]
}

Focus on:
- Text readability and overflow issues
- Layout improvements
- Color palette recommendations
- Animation timing
- Export optimization

Return ONLY valid JSON, no markdown formatting.`;

    const content = await completeText({
      purpose: 'ai_design_suggestions',
      system: 'You are a professional design assistant. Always return valid JSON only, no markdown or code blocks.',
      user: prompt,
      temperature: 0.7,
      maxTokens: 500,
      responseFormat: 'json',
      caller: 'aiService.generateDesignSuggestions',
    });
    if (!content) return null;

    // Parse JSON (handle markdown code blocks if present)
    let jsonContent = content;
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (match) jsonContent = match[1];
    }

    const parsed = JSON.parse(jsonContent);
    return parsed.suggestions || [];
  } catch (error) {
    console.error('[AI Service] Error generating design suggestions:', error);
    return null; // Fallback to mock
  }
}

/**
 * Generate caption variants for an element
 */
export async function generateCaptions(element, tone = 'Fresh', context = {}) {
  if (!hasAiText()) {
    return null; // Fallback to mock captions
  }

  try {
    const elementContext = element.src
      ? `Image: ${element.src.replace(/https?:\/\/[^/]+\//, '').replace(/[-_]/g, ' ').split('.')[0]}`
      : element.text
      ? `Current text: "${element.text}"`
      : 'Generic product';

    const prompt = `Generate 3 creative, engaging marketing captions for digital signage.

Context: ${elementContext}
Tone: ${tone}
Goal: Create compelling, action-oriented captions that grab attention

Requirements:
- Each caption should be 8-15 words
- Use active, engaging language
- Include a call-to-action or urgency
- Match the ${tone} tone
- Suitable for digital display screens

Return ONLY a JSON array of strings:
["caption 1", "caption 2", "caption 3"]`;

    const content = await completeText({
      purpose: 'ai_captions',
      system: 'You are a creative copywriter. Return only valid JSON arrays, no markdown.',
      user: prompt,
      temperature: 0.8,
      maxTokens: 200,
      responseFormat: 'json',
      caller: 'aiService.generateCaptions',
    });
    if (!content) return null;

    let jsonContent = content;
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (match) jsonContent = match[1];
    }

    const variants = JSON.parse(jsonContent);
    return Array.isArray(variants) ? variants : null;
  } catch (error) {
    console.error('[AI Service] Error generating captions:', error);
    return null; // Fallback to mock
  }
}

/**
 * Generate color palette suggestions
 */
export async function generatePalette(theme = 'modern', mood = 'uplifting', context = {}) {
  if (!hasAiText()) {
    return null; // Fallback to mock palette
  }

  try {
    const prompt = `Generate a professional color palette for digital signage design.

Theme: ${theme}
Mood: ${mood}
Context: ${JSON.stringify(context)}

Requirements:
- 4-6 hex colors
- Colors should work well together
- Suitable for digital displays (good contrast)
- Match the ${theme} theme and ${mood} mood

Return ONLY a JSON object:
{
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4"],
  "description": "Brief description of the palette"
}`;

    const content = await completeText({
      purpose: 'ai_palette',
      system: 'You are a color design expert. Return only valid JSON, no markdown.',
      user: prompt,
      temperature: 0.7,
      maxTokens: 200,
      responseFormat: 'json',
      caller: 'aiService.generatePalette',
    });
    if (!content) return null;

    let jsonContent = content;
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (match) jsonContent = match[1];
    }

    const parsed = JSON.parse(jsonContent);
    return parsed.palette || null;
  } catch (error) {
    console.error('[AI Service] Error generating palette:', error);
    return null; // Fallback to mock
  }
}

/**
 * Generate design layout from prompt
 */
export async function generateDesignLayout(prompt, options = {}) {
  if (!hasAiText()) {
    return null; // Fallback to mock layout
  }

  try {
    const {
      goal = 'poster',
      language = 'en',
      size = { width: 1080, height: 1920 },
      theme = 'modern',
      mood = 'uplifting',
      trendProfile = null,
    } = options;

    const systemPrompt = `You are a professional digital signage designer. Generate design layouts as JSON.

You have access to an up-to-date style trend profile. Use the given trendProfile (colors, typography, layout patterns, promptTags) to guide the design so it matches contemporary design trends for this content type.

Return ONLY valid JSON in this exact format:
{
  "headline": "Main headline text",
  "subheadline": "Optional subheadline",
  "cta": "Call-to-action text",
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4"],
  "layout": "centered|grid|asymmetric",
  "style": "bold|minimal|vibrant",
  "notes": ["design note 1", "design note 2"]
}`;

    // Build trend context string if available
    let trendContextStr = '';
    if (trendProfile && trendProfile.data) {
      const trendData = trendProfile.data;
      trendContextStr = `\n\nStyle Trend Profile: ${trendProfile.name}${trendProfile.season ? ` (${trendProfile.season})` : ''}`;
      
      if (trendData.palettes?.[0]?.colors) {
        trendContextStr += `\n- Recommended Colors: ${trendData.palettes[0].colors.join(', ')}`;
      }
      if (trendData.typography?.headline?.families) {
        trendContextStr += `\n- Headline Fonts: ${trendData.typography.headline.families.join(', ')}`;
      }
      if (trendData.layout_patterns) {
        trendContextStr += `\n- Layout Patterns: ${Array.isArray(trendData.layout_patterns) ? trendData.layout_patterns.join(', ') : trendData.layout_patterns}`;
      }
      if (trendData.prompt_tags) {
        trendContextStr += `\n- Style Tags: ${Array.isArray(trendData.prompt_tags) ? trendData.prompt_tags.join(', ') : trendData.prompt_tags}`;
      }
    }

    const userPrompt = `Create a digital signage design layout.

Prompt: ${prompt}
Goal: ${goal}
Theme: ${theme}
Mood: ${mood}
Size: ${size.width}x${size.height}px
Language: ${language}${trendContextStr}

Generate:
- Compelling headline (5-8 words)
- Optional subheadline (8-12 words)
- Clear call-to-action (2-4 words)
- Color palette (4 colors, hex codes)${trendProfile?.data?.palettes?.[0]?.colors ? ' - prefer colors from trend profile' : ''}
- Layout style recommendation${trendProfile?.data?.layout_patterns ? ' - use one of the trend layout patterns' : ''}
- Design style recommendation${trendProfile?.data?.prompt_tags ? ' - incorporate trend style tags' : ''}`;

    const content = await completeText({
      purpose: 'ai_design_layout',
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.8,
      maxTokens: 400,
      responseFormat: 'json',
      caller: 'aiService.generateDesignLayout',
    });
    if (!content) return null;

    let jsonContent = content;
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (match) jsonContent = match[1];
    }

    return JSON.parse(jsonContent);
  } catch (error) {
    console.error('[AI Service] Error generating design layout:', error);
    return null; // Fallback to mock
  }
}

/**
 * Sanitize and validate prompt input
 */
function sanitizePrompt(prompt, maxLength = MAX_PROMPT_LENGTH) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt must be a non-empty string');
  }
  
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    throw new Error('Prompt cannot be empty');
  }
  
  if (trimmed.length > maxLength) {
    throw new Error(`Prompt exceeds maximum length of ${maxLength} characters`);
  }
  
  return trimmed;
}

/**
 * Handle OpenAI API errors and map to user-friendly messages
 */
function handleAIError(error) {
  console.error('[AI Service] Error:', error);
  
  if (error?.code === 'rate_limit_exceeded') {
    return {
      error: 'rate_limit_exceeded',
      message: 'AI service is temporarily busy. Please try again in a moment.',
      retryAfter: error.response?.headers?.['retry-after'] || 60,
    };
  }
  
  if (error?.code === 'timeout' || error?.message?.includes('timeout')) {
    return {
      error: 'timeout',
      message: 'AI service request timed out. Please try again.',
    };
  }
  
  if (error?.status === 401 || error?.code === 'invalid_api_key') {
    return {
      error: 'invalid_api_key',
      message: 'AI service configuration error. Please contact support.',
    };
  }
  
  if (error?.status === 429) {
    return {
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please try again later.',
    };
  }
  
  return {
    error: 'ai_service_error',
    message: error?.message || 'AI service encountered an error. Please try again.',
  };
}

/**
 * Generate text content using AI (via llmGateway by default).
 */
export async function generateText(options = {}) {
  if (!hasAiText()) {
    throw new Error(
      Features.llm.useGateway
        ? 'AI service is not available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.'
        : 'AI service is not available. Please configure OPENAI_API_KEY.',
    );
  }

  try {
    const {
      prompt: rawPrompt,
      language = 'en',
      tone = 'neutral',
      context = {},
    } = options;

    const prompt = sanitizePrompt(rawPrompt);

    const section = context.section || 'generic';
    const templateName = context.templateName || '';
    const brandNotes = context.brandNotes || '';

    let systemMessage = 'You are a professional copywriter for digital signage and marketing content. ';
    
    if (section === 'headline') {
      systemMessage += 'Generate compelling, attention-grabbing headlines (5-10 words). ';
    } else if (section === 'subheadline') {
      systemMessage += 'Generate informative subheadlines that support the main headline (10-20 words). ';
    } else if (section === 'body') {
      systemMessage += 'Generate clear, concise body text that explains the key message (20-50 words). ';
    } else if (section === 'cta') {
      systemMessage += 'Generate strong call-to-action phrases (2-5 words). ';
    }

    if (tone !== 'neutral') {
      systemMessage += `Use a ${tone} tone. `;
    }

    if (language === 'vi') {
      systemMessage += 'Write in Vietnamese. ';
    } else {
      systemMessage += 'Write in English. ';
    }

    if (brandNotes) {
      systemMessage += `Brand guidelines: ${brandNotes.substring(0, 200)}. `;
    }

    systemMessage += 'Return only the generated text, no explanations or markdown.';

    let userPrompt = prompt;
    if (templateName) {
      userPrompt = `Template: ${templateName}. ${userPrompt}`;
    }

    const temperature = tone === 'professional' ? 0.5 : tone === 'playful' ? 0.9 : 0.7;
    const maxTokens = section === 'cta' ? 50 : section === 'headline' ? 100 : 200;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), AI_TIMEOUT_MS);
    });

    const content = await Promise.race([
      completeText({
        purpose: 'ai_generate_text',
        system: systemMessage,
        user: userPrompt,
        temperature,
        maxTokens,
        timeoutMs: AI_TIMEOUT_MS,
        caller: 'aiService.generateText',
      }),
      timeoutPromise,
    ]);

    if (!content) {
      throw new Error('AI service returned empty response');
    }

    return {
      text: content,
      prompt: prompt,
      language,
      tone,
      section,
    };
  } catch (error) {
    const handled = handleAIError(error);
    throw handled;
  }
}

/**
 * Generate text with explicit system and user prompts (e.g. for JSON menu generation).
 * Routes through llmGateway by default (Phase 0).
 */
export async function generateTextWithSystemPrompt(options = {}) {
  if (!hasAiText()) {
    throw new Error(
      Features.llm.useGateway
        ? 'AI service is not available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.'
        : 'AI service is not available. Please configure OPENAI_API_KEY.',
    );
  }
  const {
    systemPrompt = '',
    userPrompt = '',
    temperature = 0.3,
    maxTokens = 4000,
    timeoutMs = 60000,
  } = options;

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
  });

  const content = await Promise.race([
    completeText({
      purpose: 'ai_generate_text_system',
      system: systemPrompt,
      user: userPrompt,
      temperature,
      maxTokens,
      timeoutMs,
      caller: 'aiService.generateTextWithSystemPrompt',
    }),
    timeoutPromise,
  ]);

  if (!content) {
    throw new Error('AI service returned empty response');
  }
  return { text: content };
}

/**
 * Generate image using DALL-E
 */
export async function generateImage(options = {}) {
  if (!HAS_AI) {
    throw new Error('AI service is not available. Please configure OPENAI_API_KEY.');
  }

  try {
    const {
      prompt: rawPrompt,
      style = 'photo',
      aspectRatio = 'square',
    } = options;

    // Sanitize prompt
    const prompt = sanitizePrompt(rawPrompt, 1000); // Shorter limit for image prompts

    // Map aspect ratios to DALL-E sizes
    const sizeMap = {
      square: '1024x1024',
      landscape: '1792x1024',
      portrait: '1024x1792',
    };

    const size = sizeMap[aspectRatio] || '1024x1024';

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

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), AI_TIMEOUT_MS);
    });

    // Generate image
    const apiCall = openai.images.generate({
      model: 'dall-e-3',
      prompt: enhancedPrompt,
      size: size,
      quality: 'standard',
      n: 1,
    });

    const response = await Promise.race([apiCall, timeoutPromise]);
    const imageUrl = response.data[0]?.url;

    if (!imageUrl) {
      throw new Error('AI service did not return an image URL');
    }

    return {
      url: imageUrl,
      prompt: prompt,
      style,
      aspectRatio,
      size,
    };
  } catch (error) {
    const handled = handleAIError(error);
    throw handled;
  }
}

/**
 * Download image from URL and save to uploads directory
 * Returns the local file path and metadata
 */
export async function downloadAndSaveImage(imageUrl, filename = null) {
  try {
    // Create timeout promise for download
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Image download timeout')), IMAGE_DOWNLOAD_TIMEOUT_MS);
    });

    // Download image
    const downloadPromise = fetch(imageUrl);
    const response = await Promise.race([downloadPromise, timeoutPromise]);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    // node-fetch v3 uses arrayBuffer() instead of buffer()
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = '.png';
    const baseName = filename || `ai-generated-${Date.now()}`;
    const originalName = `${baseName}${ext}`;
    const { uploadBuffer } = await import('../lib/storage/index.js');
    const { normalizeMediaUrlForStorage } = await import('../utils/publicUrl.js');
    const { key, url } = await uploadBuffer(buffer, originalName, 'image/png', 'artifacts');
    const relativeUrl = normalizeMediaUrlForStorage(url, null);
    const filePath = url.startsWith('/uploads/') ? path.join(process.cwd(), url.slice(1)) : null;

    // Get image metadata using sharp (with error handling)
    let width, height;
    try {
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(buffer).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch (sharpError) {
      console.warn('[AI Service] Failed to load sharp or extract metadata:', sharpError.message);
      console.warn('[AI Service] Image saved but metadata extraction skipped');
      // Continue without metadata - image is still saved
    }

    return {
      filePath,
      url: relativeUrl,
      storageKey: key,
      width: width || null,
      height: height || null,
      sizeBytes: buffer.length,
      mime: 'image/png',
    };
  } catch (error) {
    console.error('[AI Service] Error downloading/saving image:', error);
    throw {
      error: 'image_download_failed',
      message: error.message || 'Failed to download and save image',
    };
  }
}

/**
 * Check if AI service is available
 */
export function isAIAvailable() {
  return HAS_AI;
}

