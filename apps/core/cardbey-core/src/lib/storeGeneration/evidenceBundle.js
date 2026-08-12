/**
 * EvidenceBundle — canonical pre-composition evidence for store generation.
 * Distinguishes OCR facts from visual inference. Phase 1 contract (unwired).
 */

import { storeField } from './fieldStatus.js';

/**
 * @typedef {import('./fieldStatus.js').StoreField} StoreField
 * @typedef {import('./fieldStatus.js').EvidenceSourceType} EvidenceSourceType
 */

/**
 * @typedef {{
 *   id: string,
 *   sourceType: EvidenceSourceType,
 *   label?: string | null,
 *   ref?: string | null,
 *   capturedAt?: string | null,
 * }} EvidenceSource
 */

/**
 * @typedef {{
 *   schema: 'cb-evidence-bundle',
 *   version: 'v1',
 *   sources: EvidenceSource[],
 *   extractedFacts: Array<StoreField<unknown> & { key: string }>,
 *   extractedAssets: Array<{
 *     kind: string,
 *     ref?: string | null,
 *     role?: string | null,
 *     sourceType?: EvidenceSourceType | null,
 *     confidence?: number | null,
 *   }>,
 *   visualSignals: Array<StoreField<unknown> & { key: string }>,
 *   inferredSignals: Array<StoreField<unknown> & { key: string }>,
 *   intakeEvidenceId?: string | null,
 *   createdAt: string,
 * }} EvidenceBundle
 */

/**
 * @param {Partial<EvidenceBundle>} [input]
 * @returns {EvidenceBundle}
 */
export function createEmptyEvidenceBundle(input = {}) {
  return {
    schema: 'cb-evidence-bundle',
    version: 'v1',
    sources: Array.isArray(input.sources) ? input.sources : [],
    extractedFacts: Array.isArray(input.extractedFacts) ? input.extractedFacts : [],
    extractedAssets: Array.isArray(input.extractedAssets) ? input.extractedAssets : [],
    visualSignals: Array.isArray(input.visualSignals) ? input.visualSignals : [],
    inferredSignals: Array.isArray(input.inferredSignals) ? input.inferredSignals : [],
    intakeEvidenceId: input.intakeEvidenceId ?? null,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

/**
 * @param {EvidenceBundle} bundle
 * @param {string} key
 * @param {unknown} value
 * @param {Partial<import('./fieldStatus.js').StoreField<unknown>>} [meta]
 */
export function addExtractedFact(bundle, key, value, meta = {}) {
  const field = { key, ...storeField(value, { status: meta.status || 'VERIFIED', ...meta }) };
  bundle.extractedFacts.push(field);
  return field;
}

/**
 * Visual inference must not be mixed into extractedFacts.
 * @param {EvidenceBundle} bundle
 * @param {string} key
 * @param {unknown} value
 * @param {Partial<import('./fieldStatus.js').StoreField<unknown>>} [meta]
 */
export function addVisualSignal(bundle, key, value, meta = {}) {
  const field = { key, ...storeField(value, { status: meta.status || 'INFERRED', ...meta }) };
  bundle.visualSignals.push(field);
  return field;
}

/**
 * @param {EvidenceBundle} bundle
 * @param {string} key
 */
export function getFact(bundle, key) {
  return bundle.extractedFacts.find((f) => f.key === key) || null;
}

export default {
  createEmptyEvidenceBundle,
  addExtractedFact,
  addVisualSignal,
  getFact,
};
