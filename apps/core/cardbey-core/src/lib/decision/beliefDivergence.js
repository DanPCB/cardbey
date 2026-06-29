/**
 * Detect disagreements between belief source layers (Phase 1 shadow diagnostics).
 */

/**
 * @param {import('./constants.js').BeliefDivergence[]} divergences
 * @param {string} field
 * @param {unknown} valueA
 * @param {string} nameA
 * @param {unknown} valueB
 * @param {string} nameB
 */
export function noteDivergence(divergences, field, valueA, nameA, valueB, nameB) {
  const norm = (v) => {
    if (v == null || v === '') return null;
    return String(v).trim();
  };
  const a = norm(valueA);
  const b = norm(valueB);
  if (a === b) return;
  if (a == null || b == null) return;
  divergences.push({
    field,
    sourceA: valueA,
    sourceAName: nameA,
    sourceB: valueB,
    sourceBName: nameB,
  });
}

/**
 * @param {import('./constants.js').BeliefDivergence[]} divergences
 */
export function hasMaterialDivergence(divergences) {
  const materialFields = new Set([
    'storeId',
    'draftId',
    'missionId',
    'workflowType',
    'hasUpload',
    'businessName',
    'pendingClarify',
  ]);
  return divergences.some((d) => materialFields.has(d.field));
}
