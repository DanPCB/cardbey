// DANH: skill-round6-document
/**
 * Structured business-document extraction from images.
 * Reuses Anthropic vision (primary) and OpenAI gpt-4o (fallback) — same stack as menu/OCR.
 */

import OpenAI from 'openai';
import fetch from 'node-fetch';
import { postAnthropicMessages } from '../../lib/llm/anthropicProvider.js';
import { generateText } from '../../lib/llm/anthropicProvider.js';
import { runOcr } from '../../modules/vision/runOcr.js';
import { parseIntakePreprocessVisionOutput } from '../../lib/ocr/intakeImagePreprocess.js';

import { resolveCommerceMode, resolveItemKind } from '../../lib/storeTransactionMode.js';
import { isPlaceholderCategoryName } from '../../lib/draftCategoryUtils.js';

export const DOCUMENT_BUSINESS_EXTRACTION_PROMPT = `You are DocumentIngestionSkill for Cardbey. Extract ALL structured business data from this document.

Return ONLY valid JSON with this schema:
{
  "documentType": "flyer|brochure|menu|promo|event|price_list|other",
  "business": { "name": "", "type": "" },
  "businessType": "",
  "commerceMode": "booking|order|inquiry",
  "businessName": "",
  "contacts": [{ "phone": "", "email": "", "website": "", "address": "", "role": "" }],
  "campaign": { "name": "", "copy": "", "channel": "", "urgency": "" },
  "products": [
    {
      "name": "",
      "description": "",
      "dates": "",
      "location": "",
      "venues": [],
      "pricing": [{ "tier": "", "price": null, "currency": "" }],
      "includes": [],
      "highlights": [],
      "deadline": "",
      "price": null,
      "priceDisplay": "",
      "category": "",
      "kind": "service|product"
    }
  ],
  "campaigns": [
    { "name": "", "copy": "", "channel": "", "urgency": "" }
  ],
  "calendar": [
    { "week": "", "action": "", "content": "", "channel": "" }
  ],
  "offers": [
    {
      "title": "",
      "description": "",
      "price": null,
      "discount": "",
      "startsAt": "",
      "endsAt": "",
      "eventDate": "",
      "venue": ""
    }
  ],
  "events": [
    {
      "name": "",
      "date": "",
      "venue": "",
      "highlights": [],
      "inclusions": []
    }
  ],
  "gaps": [],
  "highlights": []
}

Rules:
- Preserve original language for names/titles; use English only for descriptions when unclear.
- Use ISO dates (YYYY-MM-DD) when a date is visible; otherwise empty string.
- price is numeric only (no currency symbol); priceDisplay is as printed.
- businessName should mirror business.name when present.
- businessType mirrors business.type; commerceMode: booking for salons/spas/travel/tours/golf/classes/clinics/repairs/photography; order for retail/food; inquiry for custom/quote-only.
- Each product kind: service for bookable offerings (appointments, tours, treatments); product for physical goods or menu items to order.
- category must be a human-readable section name (e.g. Manicures, Golf Tours) — never cat_0 or placeholder ids.
- contacts[].address: only when a street or venue address is explicitly visible on the document. Use empty string if absent — NEVER guess or invent a city, suburb, or country.
- products[].location and venue fields: only when printed on the document; empty string if not present.
- Empty arrays when nothing found. No markdown fences.`;

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
 * @returns {object}
 */
export function parseDocumentExtractionJson(text) {
  const cleaned = stripJsonFence(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fall through
    }
  }
  return {
    documentType: 'other',
    business: { name: '', type: '' },
    businessName: '',
    contacts: [],
    campaign: null,
    products: [],
    campaigns: [],
    calendar: [],
    offers: [],
    events: [],
    gaps: [],
    highlights: [],
  };
}

/**
 * Normalize legacy + new extraction shapes for downstream executors.
 * Fills defaults for partial vision/OCR output (low-res scans, overlapping text).
 * @param {object} data
 */
export function normalizeDocumentExtraction(data) {
  const raw = data && typeof data === 'object' ? data : {};
  const businessName =
    String(raw.businessName ?? raw.business?.name ?? '').trim();
  const businessType = String(raw.businessType ?? raw.business?.type ?? '').trim();
  const business = {
    name: String(raw.business?.name ?? businessName).trim(),
    type: businessType,
  };
  const commerceMode = resolveCommerceMode(businessType || businessName, {
    commerceMode: raw.commerceMode,
  });

  const contacts = (Array.isArray(raw.contacts)
    ? raw.contacts
    : raw.contacts && typeof raw.contacts === 'object'
      ? [raw.contacts]
      : []
  ).map((c) => {
    const address = String(c?.address ?? '').trim();
    return {
      phone: String(c?.phone ?? '').trim(),
      email: String(c?.email ?? '').trim(),
      website: String(c?.website ?? '').trim(),
      address: address || null,
      role: String(c?.role ?? '').trim(),
    };
  });

  const products = (Array.isArray(raw.products) ? raw.products : []).map((p, idx) => {
    const item = p && typeof p === 'object' ? p : {};
    const name = String(item.name ?? '').trim() || `Untitled Product ${idx + 1}`;
    return {
      ...item,
      name,
      description: String(item.description ?? '').trim(),
      dates: String(item.dates ?? '').trim(),
      location: String(item.location ?? '').trim(),
      venues: Array.isArray(item.venues) ? item.venues.map(String) : [],
      pricing: Array.isArray(item.pricing)
        ? item.pricing.map((tier) => ({
            tier: String(tier?.tier ?? '').trim(),
            price: tier?.price != null && !Number.isNaN(Number(tier.price)) ? Number(tier.price) : null,
            currency: String(tier?.currency ?? '').trim() || null,
          }))
        : [],
      includes: Array.isArray(item.includes) ? item.includes.map(String) : [],
      highlights: Array.isArray(item.highlights) ? item.highlights.map(String) : [],
      deadline: item.deadline != null && String(item.deadline).trim() ? String(item.deadline).trim() : null,
      price: item.price != null && !Number.isNaN(Number(item.price)) ? Number(item.price) : null,
      priceDisplay: String(item.priceDisplay ?? '').trim(),
      category: (() => {
        const cat = String(item.category ?? '').trim();
        if (cat && !isPlaceholderCategoryName(cat)) return cat;
        return '';
      })(),
      kind: (() => {
        const k = String(item.kind ?? '').toLowerCase().trim();
        if (k === 'service' || k === 'product') return k;
        return resolveItemKind(item, commerceMode);
      })(),
    };
  });

  const campaigns = (Array.isArray(raw.campaigns) ? raw.campaigns : []).map((c, idx) => {
    const item = c && typeof c === 'object' ? c : {};
    return {
      name: String(item.name ?? '').trim() || `Campaign ${idx + 1}`,
      copy: String(item.copy ?? item.description ?? '').trim(),
      channel: String(item.channel ?? 'social').trim(),
      urgency: String(item.urgency ?? '').trim(),
    };
  });

  const calendar = (Array.isArray(raw.calendar) ? raw.calendar : []).map((entry) => ({
    week: String(entry?.week ?? '').trim(),
    action: String(entry?.action ?? '').trim(),
    content: String(entry?.content ?? '').trim(),
    channel: String(entry?.channel ?? 'social').trim(),
  }));

  const offers = (Array.isArray(raw.offers) ? raw.offers : []).map((o) => ({
    title: String(o?.title ?? '').trim(),
    description: String(o?.description ?? '').trim(),
    price: o?.price != null && !Number.isNaN(Number(o.price)) ? Number(o.price) : null,
    discount: String(o?.discount ?? '').trim(),
    startsAt: String(o?.startsAt ?? '').trim(),
    endsAt: String(o?.endsAt ?? '').trim(),
    eventDate: String(o?.eventDate ?? '').trim(),
    venue: String(o?.venue ?? '').trim(),
  }));

  const events = (Array.isArray(raw.events) ? raw.events : []).map((ev) => ({
    name: String(ev?.name ?? '').trim(),
    date: String(ev?.date ?? '').trim(),
    venue: String(ev?.venue ?? '').trim(),
    highlights: Array.isArray(ev?.highlights) ? ev.highlights.map(String) : [],
    inclusions: Array.isArray(ev?.inclusions) ? ev.inclusions.map(String) : [],
  }));

  const campaign =
    raw.campaign && typeof raw.campaign === 'object'
      ? {
          name: String(raw.campaign.name ?? '').trim(),
          copy: String(raw.campaign.copy ?? '').trim(),
          channel: String(raw.campaign.channel ?? '').trim(),
          urgency: String(raw.campaign.urgency ?? '').trim(),
        }
      : null;

  return {
    documentType: String(raw.documentType ?? 'other').trim() || 'other',
    businessName,
    businessType,
    commerceMode,
    business,
    contacts,
    campaign,
    products,
    campaigns,
    calendar,
    offers,
    events,
    gaps: Array.isArray(raw.gaps) ? raw.gaps.map((g) => String(g ?? '').trim()).filter(Boolean) : [],
    highlights: Array.isArray(raw.highlights) ? raw.highlights.map(String) : [],
  };
}

/**
 * @param {string} inputUrl
 * @returns {Promise<{ base64: string, mediaType: string } | null>}
 */
async function toBase64ForVision(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  if (inputUrl.startsWith('data:image/')) {
    const m = inputUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) return null;
    return { mediaType: m[1], base64: m[2] };
  }
  if (/^https?:\/\//i.test(inputUrl)) {
    const res = await fetch(inputUrl, { method: 'GET' });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mime.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    return { mediaType: mime, base64: Buffer.from(ab).toString('base64') };
  }
  return null;
}

function anthropicEnabled() {
  return (
    process.env.ANTHROPIC_DISABLED !== '1' &&
    process.env.ANTHROPIC_DISABLED !== 'true' &&
    Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

/**
 * @param {{ base64: string, mediaType: string }} media
 * @param {string} prompt
 */
async function extractViaAnthropicVision(media, prompt) {
  if (!anthropicEnabled()) return null;
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  const r = await postAnthropicMessages({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: media.mediaType, data: media.base64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  if (r?.error) return null;
  const text = (r?.content?.[0]?.text ?? r?.text ?? '').trim();
  return text || null;
}

/**
 * @param {string} dataUrl
 * @param {string} prompt
 */
async function extractViaOpenAiVision(dataUrl, prompt) {
  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 60000,
        maxRetries: 2,
      })
    : null;
  if (!openai) return null;

  const completion = await openai.chat.completions.create({
    model: process.env.DOCUMENT_VISION_MODEL?.trim() || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You read business flyers and documents. Return structured JSON only — no prose.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });
  return (completion.choices?.[0]?.message?.content ?? '').trim() || null;
}

/**
 * @param {string} ocrText
 */
export async function extractStructuredDocumentFromText(ocrText) {
  const text = String(ocrText ?? '').trim();
  if (!text) {
    return parseDocumentExtractionJson('');
  }

  const prompt = `${DOCUMENT_BUSINESS_EXTRACTION_PROMPT}

The document text (OCR) is below. Infer the same JSON shape from this text only.

---OCR_TEXT---
${text.slice(0, 12000)}`;

  const r = await generateText(prompt, { maxTokens: 4096 });
  if (r?.text?.trim()) {
    return normalizeDocumentExtraction(parseDocumentExtractionJson(r.text));
  }

  return normalizeDocumentExtraction(parseDocumentExtractionJson(''));
}

/**
 * @param {string} imageUrl
 * @param {{ businessName?: string }} [ctx]
 * @returns {Promise<{ data: object, provider: string, rawText?: string }>}
 */
export async function extractStructuredDocumentFromImage(imageUrl, ctx = {}) {
  const media = await toBase64ForVision(imageUrl);
  if (!media) {
    throw new Error('Could not load image for document extraction');
  }

  const dataUrl = `data:${media.mediaType};base64,${media.base64}`;
  const businessName = String(ctx.businessName || '').trim();
  const prompt = businessName
    ? `${DOCUMENT_BUSINESS_EXTRACTION_PROMPT}\n\nStore context: ${businessName}.`
    : DOCUMENT_BUSINESS_EXTRACTION_PROMPT;

  let raw = await extractViaAnthropicVision(media, prompt);
  let provider = raw ? 'anthropic' : '';

  if (!raw) {
    raw = await extractViaOpenAiVision(dataUrl, prompt);
    provider = raw ? 'openai' : '';
  }

  if (!raw) {
    const ocrRaw = await runOcr(imageUrl, { task: 'intake_preprocess' });
    const parsed = parseIntakePreprocessVisionOutput(ocrRaw);
    const fallbackText = [parsed.imageText, parsed.imageDescription].filter(Boolean).join('\n\n');
    if (fallbackText.trim()) {
      const data = normalizeDocumentExtraction(await extractStructuredDocumentFromText(fallbackText));
      return { data, provider: 'ocr+llm', rawText: fallbackText };
    }
    return { data: normalizeDocumentExtraction(parseDocumentExtractionJson('')), provider: 'none' };
  }

  return {
    data: normalizeDocumentExtraction(parseDocumentExtractionJson(raw)),
    provider,
    rawText: raw,
  };
}
