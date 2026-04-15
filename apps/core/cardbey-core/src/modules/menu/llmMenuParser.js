/**
 * LLM Menu Parser
 * Uses LLM to parse OCR text and detected items into structured menu data
 */

import { z } from 'zod';
import OpenAI from 'openai';

// Initialize OpenAI client if API key is available
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 second timeout
      maxRetries: 2,
    })
  : null;

const HAS_AI = Boolean(openai);

// 1) Define schema for LLM output
export const LLMMenuItemSchema = z.object({
  name: z.string(),
  category: z.string().optional().nullable(),
  price: z.number().optional().nullable(),
  currency: z.string().optional().nullable(), // e.g. AUD, USD
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});

export const LLMMenuParseResultSchema = z.object({
  items: z.array(LLMMenuItemSchema),
  categories: z.array(z.string()).optional().nullable(),
});

/**
 * Parse menu using LLM
 * Merges OCR text + detected items and returns structured menu
 */
export async function parseMenuWithLLM(input) {
  const { ocrText = '', detectedItems = [], locale = 'en' } = input;

  // Short-circuit: if there is basically no text, give an empty menu
  if (!ocrText.trim() && detectedItems.length === 0) {
    return { items: [], categories: [] };
  }

  // If no OpenAI, return empty result (fallback to mock parser)
  if (!HAS_AI) {
    console.warn('[LLMMenuParser] OpenAI not available, returning empty menu');
    return { items: [], categories: [] };
  }

  // Build a compact "detected items" hint list
  const detectedItemsSection =
    detectedItems.length > 0
      ? `\nDetected item labels from UI (may be incomplete or noisy):\n- ${detectedItems.join(
          '\n- '
        )}\n`
      : '';

  // Multi-shot style: we provide a system message, instructions, and 2–3 examples.
  const systemPrompt = `
You are an expert menu parser for cafes, restaurants, and service menus.
You receive raw OCR text plus optional detected card labels, and you must
return a clean JSON menu with normalized items and categories.

ALWAYS respond with valid JSON ONLY.
`;

  const userPrompt = `
Locale: ${locale}

Raw OCR text from a menu image:

"""
${ocrText.slice(0, 4000)}
"""

${detectedItemsSection}

Your task:
1. Identify menu items (food, drinks, services) from the OCR text.
2. Merge duplicates and normalize names (e.g. "FLAT WHITE" → "Flat White").
3. Guess a sensible category for each item (e.g. "Coffee", "Tea", "Beverages", "Food", "Services").
4. Extract numeric price if visible. If multiple prices, pick the standard single-serve price.
5. Guess the currency if not obvious (use "AUD" for Australian cafe examples, otherwise prefer local).
6. Write a short description if possible from the text (optional).
7. Use tags for attributes like ["hot", "iced", "large", "vegan"] if text suggests them.

Output format (JSON only, no extra text):

{
  "items": [
    {
      "name": "...",
      "category": "...",
      "price": 5.5,
      "currency": "AUD",
      "description": "...",
      "tags": ["coffee", "hot"]
    }
  ],
  "categories": ["Coffee", "Beverages", "Food"]
}

### EXAMPLE 1

Input OCR:

"""
FLAT WHITE 5.00
LATTE 5.50
CAPPUCCINO 5.50
HOT CHOCOLATE 6.00
TEA 4.50
CHAI LATTE 5.00
"""

Detected items:
- Flat White
- Latte
- Cappuccino
- Mocha
- Hot Chocolate
- Tea
- Chai Latte
- Batch Brew

Expected output:

{
  "items": [
    { "name": "Flat White", "category": "Coffee", "price": 5.0, "currency": "AUD", "description": null, "tags": ["coffee", "hot"] },
    { "name": "Latte", "category": "Coffee", "price": 5.5, "currency": "AUD", "description": null, "tags": ["coffee", "hot"] },
    { "name": "Cappuccino", "category": "Coffee", "price": 5.5, "currency": "AUD", "description": null, "tags": ["coffee", "hot"] },
    { "name": "Hot Chocolate", "category": "Beverages", "price": 6.0, "currency": "AUD", "description": null, "tags": ["hot"] },
    { "name": "Tea", "category": "Beverages", "price": 4.5, "currency": "AUD", "description": null, "tags": [] },
    { "name": "Chai Latte", "category": "Beverages", "price": 5.0, "currency": "AUD", "description": null, "tags": ["spiced"] },
    { "name": "Batch Brew", "category": "Coffee", "price": null, "currency": "AUD", "description": null, "tags": ["filter"] }
  ],
  "categories": ["Coffee", "Beverages"]
}

### EXAMPLE 2

Input OCR:

"""
PREMIUM SERVICE PACKAGE 29.99 USD
STANDARD SERVICE PACKAGE 19.99 USD
BASIC SERVICE PACKAGE 9.99 USD
"""

Expected output:

{
  "items": [
    { "name": "Premium Service Package", "category": "Services", "price": 29.99, "currency": "USD", "description": null, "tags": ["service"] },
    { "name": "Standard Service Package", "category": "Services", "price": 19.99, "currency": "USD", "description": null, "tags": ["service"] },
    { "name": "Basic Service Package", "category": "Services", "price": 9.99, "currency": "USD", "description": null, "tags": ["service"] }
  ],
  "categories": ["Services"]
}

Now produce the JSON output for the given OCR text.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt.trim() },
        { role: 'user', content: userPrompt.trim() },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }, // Force JSON output
    });

    const rawText = completion.choices[0]?.message?.content ?? '';
    // Some helpers return string, some array of blocks; normalize to string.
    const text = typeof rawText === 'string' ? rawText : JSON.stringify(rawText);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error('[LLMMenuParser] Failed to parse JSON:', err, text);
      throw new Error('LLM returned invalid JSON for menu parse');
    }

    const result = LLMMenuParseResultSchema.parse(parsed);

    // Guarantee categories list covers all item categories
    const categories = Array.from(
      new Set([
        ...(result.categories ?? []),
        ...result.items
          .map((i) => i.category)
          .filter((c) => !!c),
      ])
    );

    return {
      items: result.items,
      categories,
    };
  } catch (error) {
    console.error('[LLMMenuParser] Error calling LLM:', error);
    throw error;
  }
}


