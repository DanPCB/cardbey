/**
 * Menu extraction from uploaded image (photo / handwritten) or PDF.
 * Phase 1: extraction only; does not mutate DraftStore.
 */

import OpenAI from 'openai';
import { extractMenu as extractMenuEngine } from '../../engines/menu/extractMenu.js';
import { seedMenuCatalogItemsImages } from './catalogItemImageSeed.js';
import {
  normalizeMenuExtractItems,
  averageConfidence,
  detectSuspiciousUniformPrices,
} from './normalizeMenuExtract.js';
import { MenuExtractionLlmError } from './menuExtractionLlmError.js';
import {
  extractMenuItemsFromImageBuffer,
  isPlaceholderMenuExtraction,
} from './menuVisionExtract.js';

export { MenuExtractionLlmError } from './menuExtractionLlmError.js';

const MIN_PDF_TEXT_CHARS = 50;
const MAX_PDF_TEXT_CHARS_FOR_LLM = 120_000;

/**
 * @param {{ businessName: string, businessType: string }} ctx
 */
function buildMenuJsonInstruction(ctx) {
  return `Return ONLY valid JSON (no markdown fences), shape:
{"items":[{"name":"string","price":number|null,"currency":"AUD"|"VND"|"USD","category":"string","description":"string","confidence":number}]}
Rules:
- "price" is a number when readable, else null.
- "confidence" per item from 0 to 1 (your certainty for that row).
- "description" short; use "" if none.
- "category" must fit this business (${ctx.businessType}) — e.g. food: Drinks/Mains; beauty: Manicure/Pedicure/Gel; retail: product groupings from the document.`;
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
  const menuJson = buildMenuJsonInstruction(ctx);
  const prompt = `${menuJson}

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
          content: `You extract line items from menus, service price lists, and retail catalogs for "${ctx.businessName}" (${ctx.businessType}). Prefer categories that match this business type, not generic cafe labels unless the text is clearly a cafe menu. JSON only.`,
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
    console.log('[menu-extract] starting extraction', {
      fileType: mimeType,
      fileSize: fileBuffer?.length ?? 0,
      businessName: ctx.businessName,
      businessType: ctx.businessType,
    });

    let visionItems = [];
    try {
      visionItems = await extractMenuItemsFromImageBuffer(fileBuffer, mimeType, {
        businessName: ctx.businessName,
        businessType: ctx.businessType,
        language,
      });
    } catch (e) {
      if (e instanceof MenuExtractionLlmError) throw e;
      warnings.push(`Direct vision extraction failed: ${e?.message || String(e)}`);
    }

    console.log('[menu-extract] vision result', {
      itemCount: visionItems?.length ?? 0,
      firstItem: visionItems?.[0],
      usedFallback: !visionItems?.length,
    });

    if (!visionItems.length) {
      const dataUrl = bufferToDataUrl(mimeType, fileBuffer);
      let engineResult;
      try {
        engineResult = await extractMenuEngine(
          {
            tenantId: 'temp',
            storeId: null,
            imageUrl: dataUrl,
            locale: language,
            businessName: ctx.businessName,
            businessType: ctx.businessType,
          },
          undefined,
        );
      } catch (e) {
        throw new MenuExtractionLlmError('Menu engine extraction failed', { cause: e });
      }
      const structured = engineResult?.data?.items;
      const items = Array.isArray(structured) ? structured : [];
      if (isPlaceholderMenuExtraction(items)) {
        warnings.push('Engine returned placeholder items; vision extraction may have failed');
        visionItems = [];
      } else {
        visionItems = items.map((it) => ({
          name: it?.name ?? '',
          price: it?.price ?? null,
          currency: it?.currency ?? 'AUD',
          category: it?.category ?? 'General',
          description: it?.description ?? '',
          confidence: 1.0,
        }));
      }
      console.log('[menu-extract] engine fallback result', {
        itemCount: visionItems.length,
        firstItem: visionItems[0],
        usedFallback: visionItems.length === 0,
      });
    }

    rawText = visionItems.map((i) => `${i?.name ?? ''} ${i?.price ?? ''}`.trim()).filter(Boolean).join('\n');
    appendLanguageWarnings(rawText, language, warnings);
    rawItems = visionItems;
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

  let items = normalizeMenuExtractItems(rawItems, { language });

  const priceCheck = detectSuspiciousUniformPrices(items);
  if (priceCheck.priceWarning) {
    warnings.push(
      `All ${items.length} items share the same price (${priceCheck.uniformPrice}) — prices may not match your menu. Review before applying.`,
    );
  }

  if (items.length > 0) {
    items = await seedMenuCatalogItemsImages(items, {
      businessName: ctx.businessName,
      storeType: ctx.businessType,
    });
  }

  const confidence = averageConfidence(items);

  console.log('[menu-extract] extraction result', {
    itemCount: items.length,
    firstItem: items[0] ? { name: items[0].name, price: items[0].price, category: items[0].category } : null,
    usedFallback: isPlaceholderMenuExtraction(items),
    priceWarning: priceCheck.priceWarning,
    withImages: items.filter((i) => i.imageUrl).length,
  });

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
    priceWarning: priceCheck.priceWarning,
    uniformPrice: priceCheck.uniformPrice,
  };
}
