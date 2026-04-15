/**
 * Strict JSON business profile classifier for Seed Builder + Validators.
 * businessType PRIMARY, businessName SECONDARY. Does NOT consume aiCreditsBalance or welcomeFullStoreRemaining.
 * Heuristic first; AI refine only when confidence < 0.7. Fallback to heuristic on AI failure/invalid output.
 */

import { resolveVertical, VERTICALS } from '../../../lib/verticals/verticalTaxonomy.js';

const CONFIDENCE_THRESHOLD = 0.7;
const HEURISTIC_CONFIDENCE = 0.55;
const MAX_DESCRIPTION_CHARS = 140;
const CLASSIFY_TIMEOUT_MS = 4000;
const KEYWORDS_MIN = 5;
const KEYWORDS_MAX = 12;
const CATEGORY_HINTS_MIN = 3;
const CATEGORY_HINTS_MAX = 8;
const FORBIDDEN_KEYWORDS_MAX = 12;

const ALLOWED_VERTICAL_GROUPS = ['food', 'retail', 'services', 'beauty', 'health', 'events', 'home', 'auto', 'education', 'other'];
const ALLOWED_BUSINESS_MODELS = ['products', 'services', 'bookings', 'quote_based', 'mixed'];
const ALLOWED_AUDIENCES = ['kids', 'adults', 'b2b', 'b2c', 'unisex'];
const ALLOWED_PRICE_TIERS = ['budget', 'mid', 'premium'];

/** Map taxonomy group to schema verticalGroup (entertainment -> events, fashion -> retail). */
function toSchemaGroup(group) {
  if (group === 'entertainment') return 'events';
  if (group === 'fashion') return 'retail';
  if (ALLOWED_VERTICAL_GROUPS.includes(group)) return group;
  return 'other';
}

function normalize(str) {
  if (str == null || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @typedef {{
 *   verticalGroup: string,
 *   verticalSlug: string,
 *   businessModel: string,
 *   audience: string,
 *   priceTier: string,
 *   keywords: string[],
 *   categoryHints: string[],
 *   forbiddenKeywords: string[],
 *   businessDescriptionShort: string,
 *   confidence: number
 * }} ClassifierProfile
 */

/**
 * Heuristic first-pass: verticalSlug/verticalGroup, audience, businessModel, priceTier, keywords, categoryHints, forbiddenKeywords, businessDescriptionShort.
 * @param {{ businessName?: string, businessType?: string, location?: string, notes?: string }} inputs
 * @returns {ClassifierProfile}
 */
function heuristicProfile(inputs) {
  const { businessName = '', businessType = '', location = '', notes = '' } = inputs;
  const combined = [businessType, businessName, notes, location].filter(Boolean).join(' ');
  const text = normalize(combined);

  const resolved = resolveVertical({
    businessType: (businessType || '').toString(),
    businessName: (businessName || '').toString(),
    userNotes: [notes, location].filter(Boolean).join(' '),
    explicitVertical: null,
  });

  const verticalSlug = resolved.slug;
  const rawGroup = resolved.group;
  const verticalGroup = toSchemaGroup(rawGroup);
  const entry = VERTICALS.find((v) => v.slug === verticalSlug);
  const label = entry?.label || verticalSlug.split('.').pop() || '';

  let audience = 'b2c';
  if (/\b(kids|children|child|toddler|baby|youth)\b/.test(text)) audience = 'kids';
  else if (/\b(b2b|corporate|commercial|wholesale|business)\b/.test(text)) audience = 'b2b';

  let businessModel = 'services';
  if (/\b(booking|appointment|session|class|course)\b/.test(text)) businessModel = 'bookings';
  else if (/\b(quote|call-out|callout|consultation|consulting|estimate)\b/.test(text)) businessModel = 'quote_based';
  else if (['retail', 'fashion', 'beauty'].includes(rawGroup)) businessModel = 'products';
  else if (rawGroup === 'food' && (/\b(restaurant|dine|menu|eat)\b/.test(text) || entry?.slug?.startsWith('food.'))) businessModel = 'mixed';

  const priceTier = 'mid';

  let keywords = Array.isArray(resolved.matchedKeywords) ? resolved.matchedKeywords.map((k) => String(k).toLowerCase().trim()) : [];
  if (entry?.keywords) {
    const fromEntry = entry.keywords.slice(0, KEYWORDS_MAX).map((k) => k.toLowerCase());
    keywords = [...new Set([...keywords, ...fromEntry])].slice(0, KEYWORDS_MAX);
  }
  while (keywords.length < KEYWORDS_MIN && entry?.keywords?.length) {
    keywords.push(entry.keywords[Math.min(keywords.length, entry.keywords.length - 1)].toLowerCase());
  }
  keywords = keywords.slice(0, KEYWORDS_MAX);

  const categoryHints = [];
  if (label) categoryHints.push(label);
  if (entry?.keywords) categoryHints.push(...entry.keywords.slice(0, 5).map((k) => k.replace(/\s+/g, ' ').trim()));
  const uniqueHints = [...new Set(categoryHints)].slice(0, CATEGORY_HINTS_MAX);
  while (uniqueHints.length < CATEGORY_HINTS_MIN) uniqueHints.push(verticalGroup + ' ' + uniqueHints.length);
  const categoryHintsFinal = uniqueHints.slice(0, CATEGORY_HINTS_MAX);

  const forbiddenKeywords = [];
  if (verticalGroup !== 'food' || verticalSlug === 'food.seafood') forbiddenKeywords.push('coffee', 'latte', 'espresso', 'cappuccino');
  if (audience === 'kids') forbiddenKeywords.push('lingerie', 'heels', 'adult', 'mens', 'womens');
  const forbiddenFinal = [...new Set(forbiddenKeywords)].slice(0, FORBIDDEN_KEYWORDS_MAX);

  let businessDescriptionShort = '';
  if (businessName && label) businessDescriptionShort = `${String(businessName).trim()} — ${label}`;
  else if (label) businessDescriptionShort = label;
  else businessDescriptionShort = String(businessName).trim() || verticalSlug;
  businessDescriptionShort = businessDescriptionShort.replace(/\s+/g, ' ').replace(/[\n\r"']/g, '').slice(0, MAX_DESCRIPTION_CHARS);

  return {
    verticalGroup,
    verticalSlug,
    businessModel,
    audience,
    priceTier,
    keywords,
    categoryHints: categoryHintsFinal,
    forbiddenKeywords: forbiddenFinal,
    businessDescriptionShort,
    confidence: HEURISTIC_CONFIDENCE,
  };
}

/**
 * Build JSON-only user prompt for AI (no credits consumed by this module; caller controls whether to call AI).
 */
function buildClassifyPrompt(businessType, businessName, location, notes) {
  return `Classify this SME business into a structured profile JSON.

Business data:
- businessType (primary): "${(businessType || '').toString().replace(/"/g, '\\"')}"
- businessName (secondary): "${(businessName || '').toString().replace(/"/g, '\\"')}"
- location: "${(location || '').toString().replace(/"/g, '\\"')}"
- notes: "${(notes || '').toString().replace(/"/g, '\\"')}"

Return JSON with EXACT keys:
verticalGroup, verticalSlug, businessModel, audience, priceTier, keywords, categoryHints, forbiddenKeywords, businessDescriptionShort, confidence

Allowed verticalGroup values:
["food","retail","services","beauty","health","events","home","auto","education","other"]

Allowed businessModel values:
["products","services","bookings","quote_based","mixed"]

Allowed audience values:
["kids","adults","b2b","b2c","unisex"]

Allowed priceTier values:
["budget","mid","premium"]

Rules:
1) businessType is more important than businessName.
2) verticalSlug should be in the format group.specific (e.g. food.seafood, beauty.nails). If unsure, use services.generic or retail.generic.
3) keywords: 5–12 items, lowercase, no duplicates, no brand names unless meaningful.
4) categoryHints: 3–8 short labels.
5) forbiddenKeywords: include terms that would clearly mismatch this business (e.g. for non-food: coffee, latte; for kids: lingerie, heels).
6) businessDescriptionShort: <=140 chars, plain text, no emojis, no quotes, no line breaks.
7) confidence: 0..1

Return JSON only.`;
}

/**
 * Validate and normalize AI response. Returns null if invalid.
 * @param {object} parsed
 * @param {ClassifierProfile} heuristic
 */
function validateAiProfile(parsed, heuristic) {
  if (!parsed || typeof parsed !== 'object') return null;

  const verticalGroup = String(parsed.verticalGroup || '').toLowerCase().trim();
  if (!ALLOWED_VERTICAL_GROUPS.includes(verticalGroup)) return null;

  const verticalSlug = String(parsed.verticalSlug || '').trim().toLowerCase();
  if (!verticalSlug || !/^[a-z0-9]+\.[a-z0-9_]+$/.test(verticalSlug)) return null;

  const businessModel = String(parsed.businessModel || '').toLowerCase().trim();
  if (!ALLOWED_BUSINESS_MODELS.includes(businessModel)) return null;

  const audience = String(parsed.audience || '').toLowerCase().trim();
  if (!ALLOWED_AUDIENCES.includes(audience)) return null;

  const priceTier = String(parsed.priceTier || '').toLowerCase().trim();
  if (!ALLOWED_PRICE_TIERS.includes(priceTier)) return null;

  let confidence = Number(parsed.confidence);
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) return null;

  let keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean) : [];
  if (keywords.length < KEYWORDS_MIN) keywords = heuristic.keywords.slice(0, KEYWORDS_MAX);
  keywords = [...new Set(keywords)].slice(0, KEYWORDS_MAX);

  let categoryHints = Array.isArray(parsed.categoryHints) ? parsed.categoryHints.map((c) => String(c).trim()).filter(Boolean) : [];
  if (categoryHints.length < CATEGORY_HINTS_MIN) categoryHints = heuristic.categoryHints.slice(0, CATEGORY_HINTS_MAX);
  categoryHints = categoryHints.slice(0, CATEGORY_HINTS_MAX);

  let forbiddenKeywords = Array.isArray(parsed.forbiddenKeywords) ? parsed.forbiddenKeywords.map((f) => String(f).toLowerCase().trim()).filter(Boolean) : [];
  forbiddenKeywords = forbiddenKeywords.slice(0, FORBIDDEN_KEYWORDS_MAX);

  let businessDescriptionShort = String(parsed.businessDescriptionShort || '').trim().replace(/\s+/g, ' ').replace(/[\n\r"']/g, '');
  if (businessDescriptionShort.length > MAX_DESCRIPTION_CHARS) businessDescriptionShort = businessDescriptionShort.slice(0, MAX_DESCRIPTION_CHARS);
  if (!businessDescriptionShort) businessDescriptionShort = heuristic.businessDescriptionShort;

  return {
    verticalGroup,
    verticalSlug,
    businessModel,
    audience,
    priceTier,
    keywords,
    categoryHints,
    forbiddenKeywords,
    businessDescriptionShort,
    confidence,
  };
}

/**
 * Call OpenAI for JSON-only classification. Does NOT touch credits. Returns null on failure/timeout.
 */
async function classifyWithAi(inputs) {
  let openai;
  try {
    const OpenAI = (await import('openai')).default;
    openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: CLASSIFY_TIMEOUT_MS,
      maxRetries: 0,
    }) : null;
  } catch {
    return null;
  }
  if (!openai) return null;

  const { businessName = '', businessType = '', location = '', notes = '' } = inputs;
  const heuristic = heuristicProfile(inputs);

  const systemPrompt = 'You are a strict business classifier. Output valid JSON only. No markdown. No explanations. No extra keys.';
  const userPrompt = buildClassifyPrompt(businessType, businessName, location, notes);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    let jsonStr = content;
    if (content.startsWith('```')) {
      const m = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (m) jsonStr = m[1];
    }
    const parsed = JSON.parse(jsonStr);
    return validateAiProfile(parsed, heuristic);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[classifyBusinessProfile] AI classification failed:', err?.message || err);
    }
    return null;
  }
}

/**
 * Classify business into strict profile JSON for Seed Builder + Validators.
 * Does NOT consume aiCreditsBalance or welcomeFullStoreRemaining.
 * @param {{ businessName?: string, businessType?: string, location?: string, notes?: string }} inputs
 * @returns {Promise<ClassifierProfile>}
 */
export async function classifyBusinessProfile(inputs = {}) {
  const heuristic = heuristicProfile(inputs);

  if (heuristic.confidence >= CONFIDENCE_THRESHOLD) {
    return heuristic;
  }

  const aiResult = await classifyWithAi(inputs);
  if (aiResult) return aiResult;

  return heuristic;
}

export { buildClassifyPrompt, heuristicProfile, validateAiProfile, toSchemaGroup };
