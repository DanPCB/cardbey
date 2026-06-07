// DANH: skill-round6-document
/**
 * extract_document_data — vision/OCR structured extraction from uploaded document image.
 */

import {
  extractStructuredDocumentFromImage,
  extractStructuredDocumentFromText,
} from '../../../services/documentExtraction/documentVisionExtract.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const imageUrl =
    (typeof input?.imageUrl === 'string' && input.imageUrl.trim()) ||
    (typeof input?.imageDataUrl === 'string' && input.imageDataUrl.trim()) ||
    null;
  const extractedText =
    typeof input?.extractedText === 'string' ? input.extractedText.trim() : '';
  const businessName =
    typeof input?.businessName === 'string' ? input.businessName.trim() : '';

  try {
    if (imageUrl) {
      const result = await extractStructuredDocumentFromImage(imageUrl, { businessName });
      const data = result.data ?? {};
      const hasContent =
        (Array.isArray(data.products) && data.products.length > 0) ||
        (Array.isArray(data.offers) && data.offers.length > 0) ||
        (Array.isArray(data.events) && data.events.length > 0) ||
        Boolean(String(data.businessName ?? '').trim());

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
        },
      };
    }

    if (extractedText) {
      const data = await extractStructuredDocumentFromText(extractedText);
      const hasContent =
        (Array.isArray(data.products) && data.products.length > 0) ||
        (Array.isArray(data.offers) && data.offers.length > 0) ||
        (Array.isArray(data.events) && data.events.length > 0);

      return {
        status: 'ok',
        output: {
          extracted: hasContent,
          provider: 'text+llm',
          data,
          productCount: Array.isArray(data.products) ? data.products.length : 0,
          offerCount: Array.isArray(data.offers) ? data.offers.length : 0,
          eventCount: Array.isArray(data.events) ? data.events.length : 0,
        },
      };
    }

    return {
      status: 'ok',
      output: {
        extracted: false,
        reason: 'No imageUrl or extractedText provided',
        data: {
          documentType: 'other',
          businessName: '',
          products: [],
          offers: [],
          events: [],
          contacts: {},
          highlights: [],
        },
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: { code: 'EXTRACTION_FAILED', message: err?.message ?? String(err) },
      output: { extracted: false },
    };
  }
}

export default execute;
