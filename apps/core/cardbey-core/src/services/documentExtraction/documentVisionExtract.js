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

export const DOCUMENT_BUSINESS_EXTRACTION_PROMPT = `Analyze this business document image (flyer, brochure, promo poster, menu, event ad).

Extract ALL visible business information and return ONLY valid JSON with this shape:
{
  "documentType": "flyer|brochure|menu|promo|event|price_list|other",
  "businessName": "",
  "products": [
    { "name": "", "description": "", "price": null, "priceDisplay": "", "category": "" }
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
  "contacts": { "phone": "", "email": "", "website": "", "address": "" },
  "highlights": []
}

Rules:
- Preserve original language for names/titles; use English only for descriptions when unclear.
- Use ISO dates (YYYY-MM-DD) when a date is visible; otherwise empty string.
- price is numeric only (no currency symbol); priceDisplay is as printed.
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
    businessName: '',
    products: [],
    offers: [],
    events: [],
    contacts: {},
    highlights: [],
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
    return parseDocumentExtractionJson(r.text);
  }

  return parseDocumentExtractionJson('');
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
      const data = await extractStructuredDocumentFromText(fallbackText);
      return { data, provider: 'ocr+llm', rawText: fallbackText };
    }
    return { data: parseDocumentExtractionJson(''), provider: 'none' };
  }

  return { data: parseDocumentExtractionJson(raw), provider, rawText: raw };
}
