/**
 * Entity Extractor — structured fields from OCR text (business card / product tag).
 */

import { llmGateway } from '../../lib/llm/llmGateway.ts';

/**
 * @param {string} text
 * @param {'business_card'|'product_tag'|'general'} [type]
 * @param {string} [tenantKey]
 */
export async function extractEntities(text, type = 'business_card', tenantKey = 'default') {
  const raw = String(text ?? '').trim();
  if (!raw) {
    return fallbackExtract('', type);
  }

  const prompt =
    `Extract structured information from OCR text (${type}).\n\n` +
    `Text:\n${raw.slice(0, 4000)}\n\n` +
    'Return ONLY JSON:\n' +
    '{"name":null,"phone":null,"email":null,"address":null,"website":null,"description":null,"category":null,"confidence":0.9}';

  try {
    const result = await llmGateway.generate({
      purpose: 'vision_entity_extract',
      prompt,
      tenantKey,
      maxTokens: 500,
      responseFormat: 'json',
      temperature: 0.2,
    });

    const cleaned = String(result?.text ?? '')
      .replace(/```json|```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned || '{}');
    if (parsed && typeof parsed === 'object') {
      return {
        name: parsed.name ?? null,
        phone: parsed.phone ?? null,
        email: parsed.email ?? null,
        address: parsed.address ?? null,
        website: parsed.website ?? null,
        description: parsed.description ?? null,
        category: parsed.category ?? null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.82,
      };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[EntityExtractor] LLM parse failed:', err?.message ?? err);
    }
  }

  return fallbackExtract(raw, type);
}

/**
 * @param {string} text
 * @param {string} type
 */
export function fallbackExtract(text, type) {
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const name =
    lines.find((l) => l.length >= 2 && l.length <= 80 && !/@/.test(l) && !/^\+?\d[\d\s-]{6,}$/.test(l)) ??
    lines[0] ??
    null;

  const description =
    type === 'product_tag' && lines.length > 1
      ? lines.slice(1, 4).join(' ')
      : lines.slice(1, 3).join(' ') || null;

  return {
    name,
    phone: extractPhone(text),
    email: extractEmail(text),
    address: extractAddress(lines),
    website: extractWebsite(text),
    description,
    category: type === 'product_tag' ? 'Scanned product' : 'Scanned item',
    confidence: 0.6,
    _fallback: true,
  };
}

function extractPhone(text) {
  const m = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function extractWebsite(text) {
  const m = text.match(/https?:\/\/[^\s]+|www\.[^\s]+/i);
  return m ? m[0] : null;
}

function extractAddress(lines) {
  const addr = lines.find((l) => /\d{4,5}/.test(l) || /\b(st|street|rd|road|ave|avenue)\b/i.test(l));
  return addr ?? null;
}

export default { extractEntities, fallbackExtract };
