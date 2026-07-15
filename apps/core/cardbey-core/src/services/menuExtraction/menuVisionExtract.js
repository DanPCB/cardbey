/**
 * Direct GPT-4o vision menu extraction from image bytes (bypasses mock engine fallback).
 */

import OpenAI from 'openai';
import { MenuExtractionLlmError } from './menuExtractionLlmError.js';

/** Placeholder rows from extractMenu.js mock fallback — never treat as real extraction. */
export const PLACEHOLDER_MENU_ITEM_NAMES = new Set([
  'standard service',
  'premium service',
  'add-on',
  'addon',
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
- Do NOT create separately priced services for mutually exclusive style choices that share one price table (e.g. "Relaxation or Deep Tissue" with shared duration prices) — one item with options or a clear name covering both
- Do NOT extract business contact details, opening hours, or social handles as catalog items
- Preserve package inclusion bullets on the matching package

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
 * @param {{ businessName?: string; businessType?: string; language?: 'en' | 'vi' }} [ctx]
 * @returns {Promise<unknown[]>}
 */
export async function extractMenuItemsFromImageBuffer(fileBuffer, mimeType, ctx = {}) {
  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 60000,
        maxRetries: 2,
      })
    : null;
  if (!openai) {
    throw new MenuExtractionLlmError('OpenAI API key not configured', { cause: 'NO_OPENAI_API_KEY' });
  }

  const mime = mimeType && /^image\//i.test(mimeType) ? mimeType : 'image/jpeg';
  const b64 = fileBuffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;
  const businessName = String(ctx.businessName || '').trim() || 'this business';
  const businessType = String(ctx.businessType || '').trim() || 'food & beverage';
  const viNote =
    ctx.language === 'vi'
      ? 'Keep Vietnamese item names as shown; add English gloss in description when helpful.'
      : '';

  const userText = `${MENU_VISION_EXTRACTION_PROMPT}

Store context: ${businessName} (${businessType}).
${viNote}`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.MENU_VISION_MODEL?.trim() || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You read service menus, spa packages, and restaurant menus and return structured JSON only. Extract every sellable item with accurate names, durations, prices, package inclusions, and add-ons. Never invent placeholder catalog rows.',
        },
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
    const raw = completion.choices?.[0]?.message?.content ?? '';
    const items = parseItemsArrayFromVisionJson(raw);
    if (isPlaceholderMenuExtraction(items)) {
      console.warn('[menu-extract] vision returned placeholder items — treating as empty');
      return [];
    }
    return items;
  } catch (e) {
    throw new MenuExtractionLlmError('OpenAI vision menu extraction failed', { cause: e });
  }
}
