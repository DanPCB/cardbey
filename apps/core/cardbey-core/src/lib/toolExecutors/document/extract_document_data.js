// DANH: skill-round6-document
/**
 * extract_document_data — vision/OCR structured extraction from uploaded document image.
 */

import {
  extractStructuredDocumentFromImage,
  extractStructuredDocumentFromText,
  normalizeDocumentExtraction,
} from '../../../services/documentExtraction/documentVisionExtract.js';

/**
 * @param {object} [input]
 */
function resolveImageUrl(input = {}) {
  const documentBase64 =
    typeof input.documentBase64 === 'string' ? input.documentBase64.trim() : '';
  const mimeType =
    (typeof input.mimeType === 'string' && input.mimeType.trim()) || 'image/jpeg';
  if (documentBase64) {
    const stripped = documentBase64.replace(/^data:image\/[^;]+;base64,/, '');
    return `data:${mimeType};base64,${stripped}`;
  }

  const documentUrl =
    (typeof input.documentUrl === 'string' && input.documentUrl.trim()) || null;
  if (documentUrl) return documentUrl;

  return (
    (typeof input?.imageUrl === 'string' && input.imageUrl.trim()) ||
    (typeof input?.imageDataUrl === 'string' && input.imageDataUrl.trim()) ||
    null
  );
}

/**
 * @param {object} data
 */
function hasExtractedContent(data) {
  return (
    (Array.isArray(data.products) && data.products.length > 0) ||
    (Array.isArray(data.offers) && data.offers.length > 0) ||
    (Array.isArray(data.events) && data.events.length > 0) ||
    (Array.isArray(data.campaigns) && data.campaigns.length > 0) ||
    (Array.isArray(data.calendar) && data.calendar.length > 0) ||
    Boolean(String(data.businessName ?? data.business?.name ?? '').trim())
  );
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const imageUrl = resolveImageUrl(input);
  const extractedText =
    typeof input?.extractedText === 'string' ? input.extractedText.trim() : '';
  const businessName =
    typeof input?.businessName === 'string' ? input.businessName.trim() : '';

  try {
    if (imageUrl) {
      const result = await extractStructuredDocumentFromImage(imageUrl, { businessName });
      const data = normalizeDocumentExtraction(result.data ?? {});
      const hasContent = hasExtractedContent(data);

      if (!hasContent && result.provider === 'none') {
        return {
          status: 'failed',
          error: { code: 'VISION_FAILED', message: 'Vision extraction returned no structured data' },
          output: {
            extracted: false,
            error: 'vision_failed',
            message: 'Vision extraction returned no structured data',
          },
        };
      }

      return {
        status: 'ok',
        output: {
          extracted: hasContent,
          provider: result.provider,
          data,
          imageUrl,
          productCount: Array.isArray(data.products) ? data.products.length : 0,
          offerCount: Array.isArray(data.offers) ? data.offers.length : 0,
          eventCount: Array.isArray(data.events) ? data.events.length : 0,
          campaignCount: Array.isArray(data.campaigns) ? data.campaigns.length : 0,
          gapCount: Array.isArray(data.gaps) ? data.gaps.length : 0,
        },
      };
    }

    if (extractedText) {
      const data = await extractStructuredDocumentFromText(extractedText);
      const normalized = normalizeDocumentExtraction(data);
      const hasContent = hasExtractedContent(normalized);

      return {
        status: 'ok',
        output: {
          extracted: hasContent,
          provider: 'text+llm',
          data: normalized,
          productCount: Array.isArray(normalized.products) ? normalized.products.length : 0,
          offerCount: Array.isArray(normalized.offers) ? normalized.offers.length : 0,
          eventCount: Array.isArray(normalized.events) ? normalized.events.length : 0,
          campaignCount: Array.isArray(normalized.campaigns) ? normalized.campaigns.length : 0,
          gapCount: Array.isArray(normalized.gaps) ? normalized.gaps.length : 0,
        },
      };
    }

    return {
      status: 'ok',
      output: {
        extracted: false,
        reason: 'No documentUrl, documentBase64, imageUrl, or extractedText provided',
        data: normalizeDocumentExtraction({}),
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: { code: 'EXTRACTION_FAILED', message: err?.message ?? String(err) },
      output: {
        extracted: false,
        error: 'vision_failed',
        message: err?.message ?? String(err),
      },
    };
  }
}

export default execute;
