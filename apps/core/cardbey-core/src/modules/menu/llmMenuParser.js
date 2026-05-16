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
  const {
    ocrText = '',
    detectedItems = [],
    locale = 'en',
    businessName: businessNameIn = null,
    businessType: businessTypeIn = null,
  } = input;

  const storeName =
    typeof businessNameIn === 'string' && businessNameIn.trim() ? businessNameIn.trim() : 'this store';
  const storeType =
    typeof businessTypeIn === 'string' && businessTypeIn.trim()
      ? businessTypeIn.trim()
      : 'retail / general';

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

  const systemPrompt = `
You extract structured line items from menus, service price lists, and retail catalogs for any business vertical.
You receive raw OCR text plus optional UI labels. Return a clean JSON object with normalized item names and categories
that fit the given store name and store type — do not assume the business is a cafe unless the text clearly shows cafe items.

ALWAYS respond with valid JSON ONLY.
`.trim();

  const userPrompt = `
Locale: ${locale}

Store context:
- Store name: ${storeName}
- Store type / vertical: ${storeType}

Raw OCR text from the uploaded document:

"""
${ocrText.slice(0, 4000)}
"""

${detectedItemsSection}

Your task:
1. Identify every priced (or unpriced) line item visible in the OCR: food, drinks, retail SKUs, appointments, packages, add-ons, etc.
2. Merge duplicates and normalize names (e.g. "GEL MANICURE" → "Gel Manicure").
3. Assign categories that match THIS store type and the document (e.g. nail salon: Manicure, Pedicure, Gel, Nail Art; cafe: Coffee, Beverages; fashion: Tops, Accessories).
4. Extract numeric price if visible. If multiple prices, pick the standard single-unit price.
5. Guess currency from symbols/text; default AUD only when the document suggests Australia.
6. Optional short description from surrounding text.
7. Tags: short attributes (e.g. "gel", "addon", "large") when supported by the text — do not invent cafe-only tags for non-cafe businesses.

Output format (JSON only, no extra text):

{
  "items": [
    {
      "name": "...",
      "category": "...",
      "price": 5.5,
      "currency": "AUD",
      "description": "...",
      "tags": []
    }
  ],
  "categories": ["..."]
}

### EXAMPLE A (cafe — for format only; do not copy items unless OCR matches)

Input OCR:
"""
FLAT WHITE 5.00
LATTE 5.50
"""

Expected shape (abbreviated): items with Coffee/Beverages-style categories when the OCR is clearly a cafe menu.

### EXAMPLE B (nail salon / beauty)

Input OCR:
"""
CLASSIC MANICURE $35
GEL MANICURE $45
SPA PEDICURE $55
NAIL ART $10+
"""

Expected output:

{
  "items": [
    { "name": "Classic Manicure", "category": "Manicure", "price": 35, "currency": "USD", "description": null, "tags": [] },
    { "name": "Gel Manicure", "category": "Manicure", "price": 45, "currency": "USD", "description": null, "tags": ["gel"] },
    { "name": "Spa Pedicure", "category": "Pedicure", "price": 55, "currency": "USD", "description": null, "tags": [] },
    { "name": "Nail Art", "category": "Nail Art", "price": 10, "currency": "USD", "description": "from $10", "tags": ["addon"] }
  ],
  "categories": ["Manicure", "Pedicure", "Nail Art"]
}

### EXAMPLE C (generic services)

Input OCR:
"""
PREMIUM SERVICE PACKAGE 29.99 USD
STANDARD SERVICE PACKAGE 19.99 USD
"""

Expected output:

{
  "items": [
    { "name": "Premium Service Package", "category": "Services", "price": 29.99, "currency": "USD", "description": null, "tags": ["package"] },
    { "name": "Standard Service Package", "category": "Services", "price": 19.99, "currency": "USD", "description": null, "tags": ["package"] }
  ],
  "categories": ["Services"]
}

Now produce the JSON output for the given OCR text and store context.
`.trim();

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


