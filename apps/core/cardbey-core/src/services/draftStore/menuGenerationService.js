/**
 * Vertical-locked menu generation (MenuFirst / IgnoreImages path).
 * Uses LLM to generate categories -> subcategories -> items. No image URLs.
 * Additive: only used when input.menuFirstMode (or menuOnly/ignoreImages) is true.
 */

import { generateTextWithSystemPrompt } from '../aiService.js';
import {
  SYSTEM_PROMPT,
  USER_PROMPT_TEMPLATE,
  validateMenuOutput,
  flattenToPreviewShape,
} from './menuGenerationValidation.js';

function stripJsonBlock(text) {
  const t = (text || '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return t;
  return t.slice(start, end + 1);
}

/**
 * Generate a vertical-locked menu via LLM. Returns { categories, items } in preview shape; item imageUrl is always null.
 * @param {object} params
 * @param {string} params.businessName
 * @param {string} [params.businessType] - human-readable store / business category for vertical discipline
 * @param {string} params.vertical
 * @param {string} [params.location]
 * @param {string} [params.priceTier]
 * @param {string} [params.currency]
 * @param {string} params.draftId - for stable item ids
 */
export async function generateVerticalLockedMenu(params) {
  const {
    businessName = '',
    businessType = '',
    vertical = '',
    location = '',
    priceTier = '',
    currency = '',
    draftId = 'menu',
    audience = '',
  } = params;

  const businessTypeLabel = String(businessType || '').trim() || 'the stated vertical';

  let userPrompt = USER_PROMPT_TEMPLATE
    .replace(/\{BUSINESS_NAME\}/g, businessName)
    .replace(/\{BUSINESS_TYPE\}/g, businessTypeLabel)
    .replace(/\{VERTICAL\}/g, vertical)
    .replace(/\{CITY_COUNTRY\}/g, location || '(not specified)')
    .replace(/\{PRICE_TIER\}/g, priceTier || '(not specified)')
    .replace(/\{CURRENCY\}/g, currency || '');
  userPrompt += `

This is a ${businessTypeLabel} business. Generate only products or services appropriate for this category.
Do not generate products outside this vertical.`;
  if (audience === 'kids') {
    userPrompt += `

AUDIENCE: kids. Generate approximately 30 items total. All product names must be kids/children/baby/toddler focused (e.g. Kids T-Shirt, Toddler Hoodie, Baby Bodysuit, Kids Sneakers). Do NOT include adult items: no men's dress shirt, women's heels, adult leather boots, formal suit, or similar.`;
  } else {
    userPrompt += `

Target total items: approximately 30 (min 24, max 36).`;
  }

  // Menu JSON can be large; use 3 min default so SDK and race timeout don't abort early
  const timeoutMs = Number(process.env.MENU_GENERATION_TIMEOUT_MS) || 180000;
  const { text } = await generateTextWithSystemPrompt({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 4000,
    timeoutMs,
  });

  const raw = stripJsonBlock(text);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Menu JSON parse failed: ${e.message}. Raw length: ${raw.length}`);
  }

  const validation = validateMenuOutput(parsed, vertical);
  const verticalLockValidationWarnings = validation.valid ? [] : [...validation.errors];
  if (!validation.valid) {
    // Advisory only: do not throw — vertical/keyword mismatches must not fail the whole draft.
    console.warn('[MenuGen] Vertical-lock validation warnings (generation continues):', validation.errors.slice(0, 8).join('; '));
  }

  const { categories, items } = flattenToPreviewShape(parsed, draftId);
  return { categories, items, verticalLockValidationWarnings };
}

export { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, validateMenuOutput, flattenToPreviewShape } from './menuGenerationValidation.js';
