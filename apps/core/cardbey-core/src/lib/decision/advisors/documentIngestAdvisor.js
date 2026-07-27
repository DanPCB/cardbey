/**
 * Document ingest advisor.
 */

import { detectDocumentIngestionIntent } from '../../intent/documentIngestIntent.js';
import { createHypothesis, pushHypothesis } from '../hypothesisUtils.js';

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function documentIngestAdvisor(belief, input) {
  const hypotheses = [];
  const userMessage = String(input.originalUserMessage ?? input.userMessage ?? '').trim();
  const ctx = {
    attachments: input.attachments,
    imageDataUrl: input.imageDataUrl,
    storeId: belief.anchors.storeId,
  };

  const docIntent = detectDocumentIngestionIntent(userMessage, ctx);
  if (docIntent === 'ingest_document') {
    pushHypothesis(
      hypotheses,
      createHypothesis({
        intent: 'ingest_document',
        score: 0.9,
        advisorId: 'document_ingest',
        suggestedTool: 'ingest_document',
        evidence: [{ source: 'rules', fact: 'document_ingest_phrase' }],
      }),
    );
  }

  return hypotheses;
}
