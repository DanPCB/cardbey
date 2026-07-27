/**
 * Advisor registry — runs all scorers in parallel (Phase 2).
 */

import { uploadAmbiguityAdvisor } from './uploadAmbiguityAdvisor.js';
import { explicitStoreAdvisor } from './explicitStoreAdvisor.js';
import { ontologyAdvisor } from './ontologyAdvisor.js';
import { documentIngestAdvisor } from './documentIngestAdvisor.js';
import { graphicLoyaltyAdvisor } from './graphicLoyaltyAdvisor.js';
import { campaignPhraseAdvisor } from './campaignPhraseAdvisor.js';
import { continuityAdvisor } from './continuityAdvisor.js';
import { ocrEvidenceAdvisor } from './ocrEvidenceAdvisor.js';

/** @type {Array<(belief: import('../constants.js').BeliefSnapshot, input: import('../advisorTypes.js').AdvisorInput) => import('../hypothesisUtils.js').Hypothesis[]>} */
export const INTAKE_ADVISORS = [
  continuityAdvisor,
  ocrEvidenceAdvisor,
  uploadAmbiguityAdvisor,
  explicitStoreAdvisor,
  ontologyAdvisor,
  documentIngestAdvisor,
  graphicLoyaltyAdvisor,
  campaignPhraseAdvisor,
];

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function runAllAdvisors(belief, input) {
  /** @type {import('../hypothesisUtils.js').Hypothesis[]} */
  const all = [];
  for (const advisor of INTAKE_ADVISORS) {
    try {
      const batch = advisor(belief, input);
      if (Array.isArray(batch) && batch.length) all.push(...batch);
    } catch (err) {
      console.warn('[intake/advisors] advisor failed (non-blocking):', err?.message ?? err);
    }
  }
  return all;
}
