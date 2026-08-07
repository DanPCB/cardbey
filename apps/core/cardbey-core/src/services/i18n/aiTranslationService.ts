/**
 * AI Translation Service
 * 
 * Provides batched translation services using OpenAI (or other LLM providers).
 * Designed to translate store content, products, and menu items efficiently.
 * 
 * TODO: Consider moving this into the Orchestrator job queue for async processing
 * TODO: Support more languages beyond EN/VI (currently hardcoded to these two)
 */

import OpenAI from 'openai';

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000, // 60 second timeout for batch translations
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

// Get model from env or default to gpt-4o-mini
const TRANSLATION_MODEL = process.env.AI_TRANSLATION_MODEL || 'gpt-4o-mini';

/**
 * Translation item input
 */
export interface TranslationItem {
  id: string;
  type: 'store' | 'category' | 'product';
  fields: Record<string, string>; // e.g., { name: "...", description: "..." }
}

/**
 * Translation result
 */
export interface TranslationResult {
  id: string;
  type: string;
  translated: Record<string, string>;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ar: 'Arabic',
  ru: 'Russian',
};

export type TranslateBatchOptions = {
  /** Human language name for prompts (overrides code map). */
  languageName?: string;
};

/**
 * Translate a batch of items to the target language
 * 
 * Uses a single batched prompt to reduce API calls and improve consistency.
 * Does not write to the database — callers must persist via translations layer only.
 * 
 * @param items - Array of items to translate, each with id, type, and fields
 * @param targetLang - Target language code (BCP-47 primary, e.g. en, vi, ja)
 * @param options - Optional prompt overrides
 * @returns Array of translation results with translated fields
 * 
 * @throws Error if OpenAI is not configured or translation fails
 */
export async function translateBatch(
  items: TranslationItem[],
  targetLang: string,
  options: TranslateBatchOptions = {}
): Promise<TranslationResult[]> {
  if (!HAS_AI) {
    throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
  }

  if (!items || items.length === 0) {
    return [];
  }

  const code = String(targetLang || '').trim().toLowerCase().split('-')[0];
  const langLabel = options.languageName || LANG_NAMES[code] || code || 'English';

  // Build the prompt with all items
  const systemPrompt = `You are a professional translator for an e-commerce/menus app. 
Translate the following objects into ${langLabel}. 
Preserve meaning, keep it concise for UI, don't add new information.
Preserve brand names and industry terms that should not be literal-translated (e.g. Cardbey, Bánh mì as Vietnamese Bánh Mì).
Return JSON only, as an object with a "results" array containing objects with "id", "type", and "translated" fields.
The "translated" field should contain the translated version of each field from the input.`;

  const userPrompt = `Translate the following items to ${langLabel}:

${JSON.stringify(items, null, 2)}

Return a JSON object with a "results" array where each object has:
- "id": the same id from input
- "type": the same type from input  
- "translated": an object with translated versions of all fields (e.g., { "name": "...", "description": "..." })

Example response format:
{
  "results": [
    { "id": "item1", "type": "product", "translated": { "name": "Translated Name", "description": "Translated Description" } },
    { "id": "item2", "type": "store", "translated": { "name": "Translated Store Name" } }
  ]
}`;

  try {
    console.log(`[AI Translation] Translating ${items.length} items to ${code} (${langLabel})...`);

    const response = await openai!.chat.completions.create({
      model: TRANSLATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent translations
      max_tokens: 4000, // Allow for longer batch responses
      // Note: Using json_object format requires response to be an object, not array
      // Our prompt asks for { "results": [...] } format
      response_format: { type: 'json_object' }, // Request JSON response
    });

    const text = response.choices[0]?.message?.content || '';
    
    if (!text) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON response
    let parsed: any;
    try {
      // OpenAI may return JSON wrapped in markdown code blocks
      const cleanedText = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('[AI Translation] Failed to parse JSON response:', text);
      throw new Error(`Invalid JSON response from translation service: ${parseError}`);
    }

    // Extract results array from response
    // OpenAI with json_object format returns an object, we expect { "results": [...] }
    let results: TranslationResult[] = [];
    if (Array.isArray(parsed)) {
      // Direct array response (fallback)
      results = parsed;
    } else if (parsed.results && Array.isArray(parsed.results)) {
      // Expected format: { "results": [...] }
      results = parsed.results;
    } else if (typeof parsed === 'object') {
      // Try to find any array in the response object
      for (const key in parsed) {
        if (Array.isArray(parsed[key])) {
          results = parsed[key];
          break;
        }
      }
    }

    // Validate results structure
    const validatedResults: TranslationResult[] = [];
    const itemMap = new Map(items.map(item => [item.id, item]));

    for (const result of results) {
      if (!result || typeof result !== 'object') {
        console.warn(`[AI Translation] Skipping invalid result:`, result);
        continue;
      }

      const { id, type, translated } = result;
      
      if (!id || !type || !translated || typeof translated !== 'object') {
        console.warn(`[AI Translation] Skipping result with missing fields:`, result);
        continue;
      }

      // Verify this result corresponds to an input item
      const originalItem = itemMap.get(id);
      if (!originalItem) {
        console.warn(`[AI Translation] Skipping result with unknown id: ${id}`);
        continue;
      }

      // Ensure all original fields are present in translation
      const validatedTranslated: Record<string, string> = {};
      for (const fieldName in originalItem.fields) {
        if (translated[fieldName] && typeof translated[fieldName] === 'string') {
          validatedTranslated[fieldName] = translated[fieldName];
        } else {
          // If translation missing, log warning but don't fail
          console.warn(`[AI Translation] Missing translation for ${id}.${fieldName}, using original`);
          validatedTranslated[fieldName] = originalItem.fields[fieldName];
        }
      }

      validatedResults.push({
        id,
        type,
        translated: validatedTranslated,
      });
    }

    // Log any items that didn't get translated
    const translatedIds = new Set(validatedResults.map(r => r.id));
    const skipped = items.filter(item => !translatedIds.has(item.id));
    
    if (skipped.length > 0) {
      console.warn(`[AI Translation] ${skipped.length} items were not translated:`, skipped.map(s => s.id));
    }

    console.log(`[AI Translation] Successfully translated ${validatedResults.length}/${items.length} items to ${code}`);

    return validatedResults;
  } catch (error: any) {
    console.error('[AI Translation] Translation failed:', error);
    throw new Error(`Translation failed: ${error.message}`);
  }
}

/**
 * Helper to determine a plausible opposite source language (legacy EN ↔ VI).
 * Prefer explicit sourceLanguage from Language Intelligence when available.
 */
export function getSourceLanguage(targetLang: string): string {
  const code = String(targetLang || '').trim().toLowerCase().split('-')[0];
  return code === 'en' ? 'vi' : 'en';
}

