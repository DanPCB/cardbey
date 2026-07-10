/**
 * Pluggable visual relevance validator — optional; pipeline works without vision/LLM.
 */

/**
 * @param {import('./serviceImageTypes.js').ServiceImageIntent} intent
 * @param {import('./serviceImageTypes.js').ServiceImageCandidate} candidate
 * @returns {Promise<{ visualScore: number, containsConflictingSubject: boolean } | null>}
 */
export async function validateServiceImageVisualRelevance(intent, candidate) {
  if (process.env.SERVICE_IMAGE_VISUAL_VALIDATION !== '1') return null;
  if (!candidate.thumbnailUrl && !candidate.imageUrl) return null;

  try {
    const mod = await import('./serviceImageVisualValidator.llm.js');
    if (typeof mod.runVisualServiceImageValidation === 'function') {
      return mod.runVisualServiceImageValidation(intent, candidate);
    }
  } catch {
    /* optional module */
  }
  return null;
}

/**
 * Stricter threshold when visual validation is unavailable.
 */
export function metadataOnlyAcceptThreshold() {
  return 0.58;
}
