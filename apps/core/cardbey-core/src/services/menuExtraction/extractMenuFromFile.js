/**
 * Menu extraction from uploaded image (photo / handwritten) or PDF.
 * Phase 1: extraction only; does not mutate DraftStore.
 */

import OpenAI from 'openai';
import { extractMenu as extractMenuEngine } from '../../engines/menu/extractMenu.js';
import { normalizeMenuExtractItems, averageConfidence } from './normalizeMenuExtract.js';

const MIN_PDF_TEXT_CHARS = 50;
const MAX_PDF_TEXT_CHARS_FOR_LLM = 120_000;

const MENU_JSON_INSTRUCTION = `Return ONLY valid JSON (no markdown fences), shape:
{"items":[{"name":"string","price":number|null,"currency":"AUD"|"VND"|"USD","category":"string","description":"string","confidence":number}]}
Rules:
- "price" is a number when readable, else null.
- "confidence" per item from 0 to 1 (your certainty for that row).
- "description" short; use "" if none.
- "category" inferred (e.g. Drinks, Mains).`;

/**
 * Thrown when a required LLM step fails (route should map to 500).
 */
export class MenuExtractionLlmError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'MenuExtractionLlmError';
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

/**
 * @param {string} mimeType
 * @param {Buffer} buffer
 */
function bufferToDataUrl(mimeType, buffer) {
  const b64 = buffer.toString('base64');
  return `data:${mimeType};base64,${b64}`;
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
function parseItemsArrayFromLlmJson(text) {
  const cleaned = stripJsonFence(text);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }
  const items = parsed && typeof parsed === 'object' ? parsed.items : null;
  return Array.isArray(items) ? items : [];
}

/**
 * @param {string} text
 * @param {{ businessName: string, businessType: string, language: 'en' | 'vi' }} ctx
 */
async function extractItemsWithOpenAiFromText(text, ctx) {
  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 30000,
        maxRetries: 2,
      })
    : null;
  if (!openai) {
    throw new MenuExtractionLlmError('OpenAI API key not configured', { cause: 'NO_OPENAI_API_KEY' });
  }

  const viNote =
    ctx.language === 'vi'
      ? 'If item names are Vietnamese, keep names in Vietnamese; put an English gloss in description when helpful.'
      : '';
  const prompt = `${MENU_JSON_INSTRUCTION}

Business context: ${ctx.businessName} (${ctx.businessType}).
${viNote}

Menu text:
${String(text).slice(0, MAX_PDF_TEXT_CHARS_FOR_LLM)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a menu extraction assistant. Extract every menu or product line with price when visible. JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices?.[0]?.message?.content ?? '';
    return parseItemsArrayFromLlmJson(raw);
  } catch (e) {
    throw new MenuExtractionLlmError('OpenAI text extraction failed', { cause: e });
  }
}

/**
 * @param {string} rawText
 * @param {'en' | 'vi'} language
 * @param {string[]} warnings
 */
function appendLanguageWarnings(rawText, language, warnings) {
  if (language === 'vi') {
    warnings.push('Vietnamese language mode selected');
  }
  const t = String(rawText || '');
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(t)) {
    warnings.push('Vietnamese text detected in source');
  }
}

/**
 * Extract structured menu items from a file buffer.
 *
 * @param {object} input
 * @param {'image' | 'pdf'} input.fileType
 * @param {Buffer} input.fileBuffer
 * @param {string} input.mimeType
 * @param {string} input.businessName
 * @param {string} input.businessType
 * @param {'en' | 'vi'} input.language
 */
export async function extractMenuFromFile(input) {
  const {
    fileType,
    fileBuffer,
    mimeType,
    businessName,
    businessType,
    language: langIn,
  } = input;
  const language = langIn === 'vi' ? 'vi' : 'en';
  const ctx = {
    businessName: String(businessName || '').trim() || 'Unknown',
    businessType: String(businessType || '').trim() || 'General',
    language,
  };

  const warnings = [];
  let rawText = '';
  /** @type {unknown[]} */
  let rawItems = [];

  if (fileType === 'image') {
    // Reuse mature menu engine (OpenAI Vision OCR + OpenAI LLM structuring).
    // We pass storeId=null so no DB save occurs.
    const dataUrl = bufferToDataUrl(mimeType, fileBuffer);
    let engineResult;
    try {
      engineResult = await extractMenuEngine(
        {
          tenantId: 'temp',
          storeId: null,
          imageUrl: dataUrl,
          locale: language,
        },
        undefined,
      );
    } catch (e) {
      throw new MenuExtractionLlmError('Menu engine extraction failed', { cause: e });
    }
    const structured = engineResult?.data?.items;
    const items = Array.isArray(structured) ? structured : [];
    rawText = items.map((i) => `${i?.name ?? ''} ${i?.price ?? ''}`.trim()).filter(Boolean).join('\n');
    appendLanguageWarnings(rawText, language, warnings);

    rawItems = items.map((it) => ({
      name: it?.name ?? '',
      price: it?.price ?? null,
      currency: it?.currency ?? 'AUD',
      category: it?.category ?? 'General',
      description: it?.description ?? '',
      confidence: 1.0,
    }));
  } else if (fileType === 'pdf') {
    let pdfText = '';
    try {
      const pdfParseMod = await import('pdf-parse');
      const pdfParse = pdfParseMod.default ?? pdfParseMod;
      const parsed = await pdfParse(fileBuffer);
      pdfText = parsed?.text != null ? String(parsed.text) : '';
    } catch (e) {
      warnings.push(`PDF text layer read failed: ${e?.message || String(e)}`);
    }

    rawText = pdfText.trim();
    appendLanguageWarnings(rawText, language, warnings);

    if (rawText.length >= MIN_PDF_TEXT_CHARS) {
      try {
        rawItems = await extractItemsWithOpenAiFromText(rawText, ctx);
      } catch (e) {
        if (e instanceof MenuExtractionLlmError) throw e;
        throw new MenuExtractionLlmError('Failed to extract items from PDF text', { cause: e });
      }
    }

    if (!rawItems.length) {
      // No existing PDF vision/rasterize path in this codebase; keep extraction-only contract.
      // If PDF has no text layer (scanned), callers should upload a photo/screenshot instead.
      if (rawText.length < MIN_PDF_TEXT_CHARS) {
        warnings.push('PDF appears scanned/image-based (no text layer). Upload a photo/screenshot for best results.');
        rawText = rawText || '[pdf: scanned or image-based; text layer empty]';
      } else {
        warnings.push('Text-based parse found no items. Try a clearer PDF or upload a photo.');
      }
    }
  } else {
    throw new Error(`Unsupported fileType: ${fileType}`);
  }

  const items = normalizeMenuExtractItems(rawItems, { language });
  const confidence = averageConfidence(items);

  const nullPrices = items.filter((i) => i.price == null).length;
  if (nullPrices > 0) {
    warnings.push('Some prices unclear or missing');
  }

  return {
    ok: items.length > 0,
    items,
    confidence,
    warnings,
    rawText,
  };
}
