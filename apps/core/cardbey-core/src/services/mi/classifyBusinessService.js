/**
 * Classify business for Create/QuickStart: verticalSlug (strict taxonomy) + short description.
 * Heuristic first; AI only when confidence < 0.7. Does NOT consume paid credits or welcome bundle.
 * Output is strict JSON only; always fallback to heuristic on AI failure/timeout.
 */

import OpenAI from 'openai';
import { resolveVertical, VERTICALS } from '../../lib/verticals/verticalTaxonomy.js';

const CLASSIFY_TIMEOUT_MS = 3500; // 2–4 seconds

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: CLASSIFY_TIMEOUT_MS,
      maxRetries: 0,
    })
  : null;

const HAS_AI = Boolean(openai);

const CONFIDENCE_THRESHOLD = 0.7;
const MAX_DESCRIPTION_CHARS = 140;

/** Allowed vertical slugs for validation */
const ALLOWED_SLUGS = new Set(VERTICALS.map((v) => v.slug));

const ALLOWED_GROUPS = ['food', 'beauty', 'fashion', 'retail', 'services', 'health', 'home', 'auto', 'education', 'events', 'entertainment', 'unknown'];

/**
 * Heuristic short description from vertical label + business name (non-AI).
 * @param {string} businessName
 * @param {string} verticalLabel - e.g. "Seafood", "Nail Salon"
 * @returns {string}
 */
function heuristicDescription(businessName, verticalLabel) {
  const name = (businessName || '').toString().trim();
  const label = (verticalLabel || '').toString().trim();
  if (name && label) return `${name} — ${label}`.slice(0, MAX_DESCRIPTION_CHARS);
  if (label) return label;
  return name || '';
}

/**
 * Validate and normalize AI response. Returns null if invalid.
 * @param {object} parsed
 * @param {string} businessName
 * @returns {{ verticalSlug: string, verticalGroup: string, confidence: number, businessDescriptionShort: string, keywords: string[] } | null}
 */
function validateAiResponse(parsed, businessName) {
  if (!parsed || typeof parsed !== 'object') return null;
  const slug = (parsed.verticalSlug || '').toString().trim();
  if (!ALLOWED_SLUGS.has(slug)) return null;
  const entry = VERTICALS.find((v) => v.slug === slug);
  let group = (parsed.verticalGroup || '').toString().trim().toLowerCase() || (entry?.group ?? slug.split('.')[0] ?? 'services');
  if (!ALLOWED_GROUPS.includes(group) && entry) {
    group = entry.group;
  }
  let confidence = Number(parsed.confidence);
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) confidence = 0.85;
  let desc = (parsed.businessDescriptionShort || '').toString().trim().replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTION_CHARS);
  if (!desc && entry) desc = heuristicDescription(businessName, entry.label);
  let keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  keywords = keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 8);
  if (keywords.length < 3 && entry?.keywords) {
    keywords = entry.keywords.slice(0, 8).map((k) => k.toLowerCase());
  }
  return {
    verticalSlug: slug,
    verticalGroup: group,
    confidence,
    businessDescriptionShort: desc,
    keywords,
  };
}

/**
 * Call OpenAI to classify and describe (strict JSON only). Returns null on any failure/timeout.
 */
async function classifyWithAi(businessName, businessType, location, notes) {
  if (!HAS_AI) return null;
  const slugsArray = Array.from(ALLOWED_SLUGS).sort();
  const systemPrompt = `You are a strict classifier. You MUST return valid JSON only. No markdown. No explanations. No extra keys.`;

  const userPrompt = `Classify this business into ONE verticalSlug from the allowed list, and write a short businessDescriptionShort (<=140 chars).
businessType is PRIMARY (use it first); businessName is SECONDARY. Return JSON with keys: verticalSlug, verticalGroup, confidence, businessDescriptionShort, keywords.

Allowed verticalSlug values:
${JSON.stringify(slugsArray)}

Business data:
- businessName: "${(businessName || '').toString().replace(/"/g, '\\"')}"
- businessType: "${(businessType || '').toString().replace(/"/g, '\\"')}"
- location: "${(location || '').toString().replace(/"/g, '\\"')}"
- notes: "${(notes || '').toString().replace(/"/g, '\\"')}"

Rules:
1) verticalSlug MUST be one of the allowed values exactly.
2) verticalGroup MUST be one of: ["food","beauty","fashion","retail","services","health","home","auto","education","events","unknown"]
3) confidence is a number 0..1 based on certainty.
4) businessDescriptionShort: <=140 characters, plain text, no emojis, no quotes, no line breaks.
5) keywords: 3–8 lowercase keywords that justify the classification (e.g. ["seafood","oysters","fish"]).

Examples:
Input: businessType="Seafood Restaurant"
Output: {"verticalSlug":"food.seafood","verticalGroup":"food","confidence":0.92,"businessDescriptionShort":"Fresh seafood dishes, oysters, and grilled fish served daily.","keywords":["seafood","oysters","fish","grill"]}

Input: businessType="Nails & Beauty Services"
Output: {"verticalSlug":"beauty.nails","verticalGroup":"beauty","confidence":0.92,"businessDescriptionShort":"Manicures, pedicures, gel sets and nail art in a clean, modern salon.","keywords":["nails","manicure","pedicure","gel","salon"]}

Input: businessType="Children Clothing"
Output: {"verticalSlug":"fashion.kids","verticalGroup":"fashion","confidence":0.95,"businessDescriptionShort":"Kids and children's clothing, from baby basics to school essentials.","keywords":["children","kids","clothing","baby","toddler"]}

Return JSON only.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 280,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    let jsonStr = content;
    if (content.startsWith('```')) {
      const m = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (m) jsonStr = m[1];
    }
    const parsed = JSON.parse(jsonStr);
    return validateAiResponse(parsed, businessName);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[classifyBusiness] AI classification failed:', err?.message || err);
    }
    return null;
  }
}

/**
 * Classify business: heuristic first, AI when confidence < 0.7. Fallback to heuristic on invalid/timeout.
 * @param {{ businessName?: string, businessType?: string, location?: string, notes?: string }} input
 * @returns {Promise<{ verticalSlug: string, verticalGroup: string, confidence: number, businessDescriptionShort: string, keywords: string[] }>}
 */
export async function classifyBusiness(input = {}) {
  const { businessName = '', businessType = '', location = '', notes = '' } = input;
  const resolved = resolveVertical({
    businessType: (businessType || '').toString(),
    businessName: (businessName || '').toString(),
    userNotes: [notes, location].filter(Boolean).join(' '),
    explicitVertical: null,
  });

  const verticalSlug = resolved.slug;
  const verticalGroup = resolved.group;
  const confidence = resolved.confidence;
  const matchedKeywords = Array.isArray(resolved.matchedKeywords) ? resolved.matchedKeywords : [];

  if (confidence >= CONFIDENCE_THRESHOLD) {
    const entry = VERTICALS.find((v) => v.slug === verticalSlug);
    const label = entry?.label || verticalSlug.split('.').pop() || '';
    const businessDescriptionShort = heuristicDescription(businessName, label);
    return {
      verticalSlug,
      verticalGroup,
      confidence,
      businessDescriptionShort,
      keywords: matchedKeywords.length ? matchedKeywords : [],
    };
  }

  const aiResult = await classifyWithAi(businessName, businessType, location, notes);
  if (aiResult) {
    return {
      verticalSlug: aiResult.verticalSlug,
      verticalGroup: aiResult.verticalGroup,
      confidence: aiResult.confidence,
      businessDescriptionShort: aiResult.businessDescriptionShort,
      keywords: aiResult.keywords.length ? aiResult.keywords : matchedKeywords,
    };
  }

  // Fallback: invalid output or error or timeout
  const entry = VERTICALS.find((v) => v.slug === verticalSlug);
  const label = entry?.label || verticalSlug.split('.').pop() || '';
  return {
    verticalSlug,
    verticalGroup,
    confidence,
    businessDescriptionShort: heuristicDescription(businessName, label) || '',
    keywords: matchedKeywords,
  };
}
