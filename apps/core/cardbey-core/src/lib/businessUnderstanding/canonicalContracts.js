/**
 * Phase 6 — Canonical contract assembly (never merge contracts).
 */

import { randomUUID } from 'node:crypto';
import { BUE_PIPELINE_VERSION } from './businessUnderstandingTypes.js';

/** @typedef {import('./businessUnderstandingTypes.js').ArtifactClassification} ArtifactClassification */
/** @typedef {import('./businessUnderstandingTypes.js').LayoutContract} LayoutContract */
/** @typedef {import('./businessUnderstandingTypes.js').IntentContract} IntentContract */
/** @typedef {import('./businessUnderstandingTypes.js').BusinessRuleContract} BusinessRuleContract */
/** @typedef {import('./businessUnderstandingTypes.js').BrandProfile} BrandProfile */
/** @typedef {import('./businessUnderstandingTypes.js').ArtifactContract} ArtifactContract */
/** @typedef {import('./businessUnderstandingTypes.js').CanonicalUnderstandingBundle} CanonicalUnderstandingBundle */
/** @typedef {import('./businessUnderstandingTypes.js').BrandAdaptationMode} BrandAdaptationMode */

/**
 * @param {{
 *   classification: ArtifactClassification;
 *   layout?: LayoutContract | null;
 *   businessRule?: BusinessRuleContract | null;
 *   brand?: BrandProfile | null;
 *   intent?: IntentContract | null;
 *   adaptationMode?: BrandAdaptationMode;
 *   sourceImageRef?: string | null;
 *   storeId?: string | null;
 *   missionId?: string | null;
 *   evidenceId?: string | null;
 * }} input
 * @returns {CanonicalUnderstandingBundle}
 */
export function buildCanonicalContracts(input = {}) {
  const classification = input.classification;
  const extractedAt = new Date().toISOString();

  /** @type {ArtifactContract} */
  const artifact = {
    schema: 'cb-artifact',
    version: 'v1',
    artifactType: classification.artifactType,
    classification,
    sourceImageRef: input.sourceImageRef ?? null,
    storeId: input.storeId ?? null,
    missionId: input.missionId ?? null,
    evidenceId: input.evidenceId ?? null,
    extractedAt,
  };

  return {
    artifact,
    layout: input.layout ?? null,
    businessRule: input.businessRule ?? null,
    brand: input.brand ?? null,
    intent: input.intent ?? null,
    adaptationMode: input.adaptationMode ?? 'brand_consistent',
    pipelineVersion: BUE_PIPELINE_VERSION,
    extractedAt,
  };
}

/**
 * Stable suitcase keys for contract storage (Phase 11).
 *
 * @param {{ storeSlug?: string | null; contractKind: string }} input
 */
export function buildSuitcaseContractKey(input = {}) {
  const slug = String(input.storeSlug ?? 'business')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 48) || 'business';
  const kind = String(input.contractKind ?? 'artifact').trim();
  return `${slug}.cb-${kind}`;
}

/**
 * @param {CanonicalUnderstandingBundle} bundle
 */
export function summarizeCanonicalContracts(bundle) {
  return {
    artifactType: bundle.artifact.artifactType,
    classificationConfidence: bundle.artifact.classification.confidence,
    hasLayout: Boolean(bundle.layout),
    hasBusinessRule: Boolean(bundle.businessRule),
    hasBrand: Boolean(bundle.brand),
    hasIntent: Boolean(bundle.intent),
    adaptationMode: bundle.adaptationMode,
    pipelineVersion: bundle.pipelineVersion,
  };
}

export default {
  buildCanonicalContracts,
  buildSuitcaseContractKey,
  summarizeCanonicalContracts,
};
