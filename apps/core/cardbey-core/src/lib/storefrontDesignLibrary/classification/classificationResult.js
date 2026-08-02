/**
 * Canonical classification result (Phase 2).
 * Confidence scale: 0.0–1.0 only.
 */

import { isBusinessContentRole } from '../contracts/contentRole.js';

export const CLASSIFIER_VERSION = 1;

export const CLASSIFICATION_REASONS = Object.freeze([
  'explicit_source_type',
  'schema_type',
  'url_pattern',
  'navigation_hierarchy',
  'deterministic_label',
  'price_and_purchase_evidence',
  'booking_evidence',
  'research_provider_type',
  'ai_classifier',
  'fallback_unknown',
]);

/**
 * @typedef {{ type: string, value?: string, weight?: number }} ClassificationEvidence
 * @typedef {{
 *   role: string,
 *   confidence: number,
 *   reason: string,
 *   evidence: ClassificationEvidence[],
 *   classifierVersion: number,
 * }} BusinessContentClassification
 */

/**
 * @param {unknown} role
 * @param {number} confidence
 * @param {string} reason
 * @param {ClassificationEvidence[]} [evidence]
 * @returns {BusinessContentClassification}
 */
export function makeClassification(role, confidence, reason, evidence = []) {
  if (!isBusinessContentRole(role)) {
    throw new Error(`[classification] Invalid role "${String(role)}"`);
  }
  const conf = Math.max(0, Math.min(1, Number(confidence)));
  if (!Number.isFinite(conf)) {
    throw new Error('[classification] confidence must be a finite 0–1 number');
  }
  if (!CLASSIFICATION_REASONS.includes(reason)) {
    throw new Error(`[classification] Invalid reason "${String(reason)}"`);
  }
  return Object.freeze({
    role,
    confidence: conf,
    reason,
    evidence: Object.freeze(
      (Array.isArray(evidence) ? evidence : []).map((e) =>
        Object.freeze({
          type: String(e?.type ?? 'unknown'),
          value: e?.value != null ? String(e.value) : undefined,
          weight: typeof e?.weight === 'number' ? e.weight : undefined,
        }),
      ),
    ),
    classifierVersion: CLASSIFIER_VERSION,
  });
}

/**
 * Additive fields for catalog/research rows (does not overwrite provenance).
 * @param {BusinessContentClassification} classification
 */
export function classificationToRowFields(classification) {
  return {
    contentRole: classification.role,
    roleConfidence: classification.confidence,
    roleReason: classification.reason,
    roleClassifierVersion: classification.classifierVersion,
    roleEvidence: classification.evidence,
  };
}

/**
 * @param {BusinessContentClassification[]} results
 */
export function summarizeClassifications(results) {
  /** @type {Record<string, number>} */
  const counts = {};
  let lowConfidenceCount = 0;
  for (const r of results) {
    counts[r.role] = (counts[r.role] ?? 0) + 1;
    if (r.confidence < 0.55) lowConfidenceCount += 1;
  }
  return { counts, lowConfidenceCount, totalItems: results.length, classifierVersion: CLASSIFIER_VERSION };
}
