/**
 * OCR / upload evidence advisor — boosts from belief.lastUpload without phrase matching.
 */

import { createHypothesis, pushHypothesis } from '../hypothesisUtils.js';

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function ocrEvidenceAdvisor(belief, input) {
  const hypotheses = [];
  const upload = belief.lastUpload;
  if (!upload) return hypotheses;

  const docType = String(upload.documentType ?? '').toLowerCase();
  const hasBusiness = Boolean(upload.businessName);

  if (docType === 'business_card' || (hasBusiness && upload.ocrText)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'create_store_from_upload',
        score: hasBusiness ? 0.55 : 0.4,
        advisorId: 'ocr_evidence',
        suggestedTool: 'create_store',
        evidence: [
          {
            source: 'context',
            fact: hasBusiness ? `business_card:${upload.businessName}` : 'business_card_ocr',
          },
        ],
      }),
    );
  }

  if (upload.imageRef || upload.ocrText) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'analyze_asset',
        score: 0.5,
        advisorId: 'ocr_evidence',
        suggestedTool: 'ingest_asset_for_intent_detection',
        evidence: [{ source: 'context', fact: 'upload_evidence_present' }],
      }),
    );
  }

  if (['menu', 'product_catalog', 'price_list'].includes(docType)) {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'import_products',
        score: 0.62,
        advisorId: 'ocr_evidence',
        suggestedTool: 'import_catalog',
        evidence: [{ source: 'context', fact: `document_type:${docType}` }],
      }),
    );
  }

  return hypotheses;
}
