/**
 * Metadata-based visual validation when LLM vision is unavailable.
 * Uses candidate text/tags as proxy for visual concepts.
 */

import { evaluateServiceMismatchGuard } from './serviceImageMismatchGuards.js';
import { scoreServiceImageCandidateMetadata } from './serviceImageCandidateScorer.js';

/**
 * @param {import('./serviceImageTypes.js').ServiceImageIntent} intent
 * @param {import('./serviceImageTypes.js').ServiceImageCandidate} candidate
 * @returns {Promise<import('../../lib/commerce/commerceProfileTypes.js').VisualRelevanceResult|null>}
 */
export async function validateServiceImageVisualRelevance(intent, candidate) {
  if (process.env.SERVICE_IMAGE_VISUAL_VALIDATION === '0') return null;
  if (!candidate.thumbnailUrl && !candidate.imageUrl) return null;

  if (process.env.SERVICE_IMAGE_VISUAL_VALIDATION === '1') {
    try {
      const mod = await import('./serviceImageVisualValidator.llm.js');
      if (typeof mod.runVisualServiceImageValidation === 'function') {
        const llm = await mod.runVisualServiceImageValidation(intent, candidate);
        if (llm) {
          return {
            expectedObjectVisible: !llm.containsConflictingSubject && llm.visualScore > 0.5,
            expectedActionVisible: llm.visualScore > 0.4,
            professionalContextVisible: llm.visualScore > 0.35,
            conflictingObjectVisible: llm.containsConflictingSubject === true,
            detectedConcepts: [],
            visualCategory: 'llm',
            confidence: llm.visualScore ?? 0,
          };
        }
      }
    } catch {
      /* optional module */
    }
  }

  const text = [candidate.title, candidate.altText, ...(candidate.tags ?? []), candidate.sourceQuery]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const meta = scoreServiceImageCandidateMetadata(intent, candidate);
  const guard = evaluateServiceMismatchGuard(intent.canonicalTitle, text);
  const objectHits = intent.objectTerms.filter((t) => text.includes(String(t).toLowerCase()));
  const actionHits = intent.actionTerms.filter((t) => text.includes(String(t).toLowerCase()));
  const expectedObjectVisible = objectHits.length > 0 || meta.matchedTerms.length > 0;
  const expectedActionVisible = actionHits.length > 0;
  const conflictingObjectVisible = !guard.pass || meta.hardReject;
  const visualScore = conflictingObjectVisible ? 0 : Math.max(meta.metadataScore, 0.55);

  return {
    expectedObjectVisible,
    expectedActionVisible,
    professionalContextVisible: intent.subjectTerms.some((t) => text.includes(String(t).toLowerCase())),
    conflictingObjectVisible,
    detectedConcepts: [...objectHits, ...actionHits, ...guard.conflicts],
    visualCategory: 'metadata_proxy',
    confidence: visualScore,
  };
}

/**
 * Stricter threshold when visual validation is unavailable.
 */
export function metadataOnlyAcceptThreshold() {
  return 0.62;
}

/**
 * @param {import('../../lib/commerce/commerceProfileTypes.js').VisualRelevanceResult} visual
 */
export function shouldRejectFromVisualResult(visual) {
  if (!visual) return false;
  if (!visual.expectedObjectVisible) return true;
  if (visual.conflictingObjectVisible) return true;
  return false;
}
