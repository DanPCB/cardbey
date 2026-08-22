/**
 * GPT-4o vision menu extraction from image bytes (via llmGateway; bypasses mock engine fallback).
 */

import OpenAI from 'openai';
import { Features } from '../../config/features.js';
import { analyzeVision } from '../../lib/llm/llmGateway.ts';
import { MenuExtractionLlmError } from './menuExtractionLlmError.js';
import { formatLayoutHintsForExtraction } from './menuLayoutStructureAgent.js';

/** Placeholder rows from extractMenu.js mock fallback — never treat as real extraction. */
export const PLACEHOLDER_MENU_ITEM_NAMES = new Set([
  'standard service',
  'premium service',
  'add-on',
  'addon',
  // Legacy spa→nails mock pack (Catalog (5) demos)
  'classic manicure',
  'gel manicure',
  'spa pedicure',
  'nail art (per nail)',
  'gel removal',
]);

export const MENU_VISION_EXTRACTION_PROMPT = `Extract ALL sellable services/products from this menu, spa package list, beauty price list, or restaurant menu image.

For each item return:
- name: exact item name as written (e.g. Refresh, Express, Eyebrow)
- price: numeric value ONLY (e.g. 69 for $69 — no currency symbol in this field)
- priceDisplay: price formatted exactly as printed (e.g. "$69")
- category: section heading (e.g. Spa Packages, Facial Treatment Packages, Massage, Waxing, Beauty Services)
- description: short subtitle if any, else ""
- durationMinutes: integer minutes when shown (30, 45, 60, 90), else null
- inclusions: array of included bullets for packages (strings), else []
- options: when one service offers variants with separate prices (e.g. duration tiers), list each { label, durationMinutes, price, priceText }; else []
- addOns: optional add-ons with their own price (e.g. hot stone $10) as { name, price, priceText }; do NOT promote add-ons as primary items
- confidence: 0-1 certainty for that row

IMPORTANT:
- Use the EXACT price shown beside each item — every item may have a different price
- If a price is unclear, use null for price (not 0, not 15, not a guess)
- Never use the same price for every item unless the menu truly shows one price for all
- Never return placeholder items like "Standard Service", "Premium Service", or "Add-on"
- Side-by-side columns with DIFFERENT price lists are SEPARATE services/categories (e.g. RELAXATION vs DEEP TISSUE) — do NOT merge them
- Only merge style names into one item when they clearly share ONE identical price table (same durations AND same prices)
- A full-width band under columns (e.g. DOUBLE / 2x Staff) is its own category/section
- When a section is a duration×price table under one heading, use that heading as name AND category, set price to the lowest duration price, and put EVERY duration row in options: [{ label: "30 Mins", durationMinutes: 30, price: 60, priceText: "$60" }, ...]
- Never return a duration-table service with empty options or null prices when durations and dollar amounts are visible
- Do NOT extract business contact details, opening hours, or social handles as catalog items
- Preserve package inclusion bullets on the matching package

Example for a duration price board section:
{
  "name": "Relaxation",
  "category": "Relaxation",
  "price": 60,
  "priceDisplay": "$60",
  "durationMinutes": 30,
  "options": [
    { "label": "30 Mins", "durationMinutes": 30, "price": 60, "priceText": "$60" },
    { "label": "45 Mins", "durationMinutes": 45, "price": 75, "priceText": "$75" },
    { "label": "60 Mins", "durationMinutes": 60, "price": 90, "priceText": "$90" }
  ],
  "inclusions": [],
  "addOns": [],
  "confidence": 0.92
}

Return ONLY a JSON array, no other text:
[
  {
    "name": "Refresh",
    "description": "",
    "price": 69,
    "priceDisplay": "$69",
    "category": "Spa Packages",
    "durationMinutes": 30,
    "inclusions": ["Herbal shampoo hair wash", "Conditioning treatment", "Head massage"],
    "options": [],
    "addOns": [],
    "confidence": 0.9
  }
]`;

/**
 * @param {unknown[]} items
 * @returns {boolean}
 */
export function isPlaceholderMenuExtraction(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  if (items.length > 6) return false;
  const names = items
    .map((it) => (typeof it?.name === 'string' ? it.name.trim().toLowerCase() : ''))
    .filter(Boolean);
  if (names.length === 0) return false;
  const placeholderHits = names.filter((n) => PLACEHOLDER_MENU_ITEM_NAMES.has(n)).length;
  return placeholderHits >= Math.min(2, names.length);
}

/**
 * @param {string} raw
 */
function stripJsonFence(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  s = s.replace(/```\s*$/i, '').trim();
  return s;
}

/**
 * @param {string} text
 * @returns {unknown[]}
 */
function parseItemsArrayFromVisionJson(text) {
  const cleaned = stripJsonFence(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  } catch {
    // fall through
  }
  const startArr = cleaned.indexOf('[');
  const endArr = cleaned.lastIndexOf(']');
  if (startArr >= 0 && endArr > startArr) {
    try {
      const parsed = JSON.parse(cleaned.slice(startArr, endArr + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      const items = parsed && typeof parsed === 'object' ? parsed.items : null;
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {{ businessName?: string; businessType?: string; language?: 'en' | 'vi'; layoutStructure?: object | null }} [ctx]
 * @returns {Promise<unknown[]>}
 */
export async function extractMenuItemsFromImageBuffer(fileBuffer, mimeType, ctx = {}) {
  const mime = mimeType && /^image\//i.test(mimeType) ? mimeType : 'image/jpeg';
  const b64 = fileBuffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;
  const businessName = String(ctx.businessName || '').trim() || 'this business';
  const businessType = String(ctx.businessType || '').trim() || 'food & beverage';
  const viNote =
    ctx.language === 'vi'
      ? 'Keep Vietnamese item names as shown; add English gloss in description when helpful.'
      : '';
  const layoutBlock = formatLayoutHintsForExtraction(ctx.layoutStructure);

  const userText = `${MENU_VISION_EXTRACTION_PROMPT}

Store context: ${businessName} (${businessType}).
${viNote}
${layoutBlock ? `\n${layoutBlock}\n` : ''}`;

  const systemPrompt =
    'You read service menus, spa packages, and restaurant menus and return structured JSON only. Extract every sellable item with accurate names, durations, prices, package inclusions, and add-ons. When a layout structure is provided, follow its sections, columns, and reading order. Never invent placeholder catalog rows.';

  try {
    let raw = '';
    if (Features.vision.useGateway) {
      const response = await analyzeVision({
        image: b64,
        mediaType: mime,
        prompt: userText,
        system: systemPrompt,
        provider: process.env.VISION_PROVIDER?.trim() || 'openai',
        model: process.env.MENU_VISION_MODEL?.trim() || 'gpt-4o',
        maxTokens: 4096,
        detail: 'high',
        purpose: 'menu_vision_extract',
      });
      raw = response.content ?? '';
    } else {
      const openai = process.env.OPENAI_API_KEY
        ? new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 60000,
            maxRetries: 2,
          })
        : null;
      if (!openai) {
        throw new MenuExtractionLlmError('OpenAI API key not configured', {
          cause: 'NO_OPENAI_API_KEY',
        });
      }
      const completion = await openai.chat.completions.create({
        model: process.env.MENU_VISION_MODEL?.trim() || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      });
      raw = completion.choices?.[0]?.message?.content ?? '';
    }

    const items = parseItemsArrayFromVisionJson(raw);
    if (isPlaceholderMenuExtraction(items)) {
      console.warn('[menu-extract] vision returned placeholder items — treating as empty');
      return [];
    }
    return items;
  } catch (e) {
    if (e instanceof MenuExtractionLlmError) throw e;
    throw new MenuExtractionLlmError('OpenAI vision menu extraction failed', { cause: e });
  }
}
