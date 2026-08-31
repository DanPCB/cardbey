/**
 * Orchestrates evidence-ordered classification (Phase 2).
 * Deterministic rules win; AI is optional and off by default.
 */

import { buildClassificationInput } from './classificationEvidence.js';
import { makeClassification, CLASSIFIER_VERSION } from './classificationResult.js';
import {
  matchExplicitOrSchema,
  matchResearchProviderType,
  matchStrongExclusions,
  matchCommerceEvidence,
  matchOfferingRoles,
} from './deterministicRules.js';

const AI_CONFIDENCE_THRESHOLD = 0.55;

/**
 * Optional AI fallback — only when ENABLE_DESIGN_LIBRARY_AI_CLASSIFIER=true.
 * Phase 2 works fully without AI.
 * @param {import('./classificationEvidence.js').ClassificationInput} _input
 * @returns {null}
 */
function tryAiClassifier(_input) {
  const raw = String(process.env.ENABLE_DESIGN_LIBRARY_AI_CLASSIFIER ?? '')
    .trim()
    .toLowerCase();
  if (raw !== 'true' && raw !== '1' && raw !== 'on') return null;
  // No AI provider wired in Phase 2 — reserved hook.
  return null;
}

/**
 * Classify a single content row / page.
 * @param {unknown} item
 * @param {Record<string, unknown>} [context]
 */
export function classifyBusinessContent(item, context = {}) {
  const input = buildClassificationInput(item, context);

  // 1–2 Explicit / schema
  const explicit = matchExplicitOrSchema(input);
  if (explicit) return explicit;

  // Research provider type (e.g. extractServiceCategoryLinksFromHtml type field)
  const researchType = matchResearchProviderType(input);
  if (researchType) return researchType;

  // 3 Strong exclusions
  const exclusion = matchStrongExclusions(input);
  if (exclusion) return exclusion;

  // 4 URL hierarchy soft signals already partially in exclusions; offering uses nav depth
  // 5 Commerce / booking
  const commerce = matchCommerceEvidence(input);
  if (commerce) return commerce;

  // 6 Label / offering rules
  const offering = matchOfferingRoles(input, context);
  if (offering) return offering;

  // 7 Optional AI
  const ai = tryAiClassifier(input);
  if (ai && ai.confidence >= AI_CONFIDENCE_THRESHOLD) return ai;

  // 8 Unknown
  return makeClassification('unknown', 0.35, 'fallback_unknown', [
    { type: 'unresolved_label', value: input.label || input.urlPath || '', weight: 0.3 },
  ]);
}

export { CLASSIFIER_VERSION };
