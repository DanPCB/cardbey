/**
 * Bridge structured facts → intake v2 JSON (facts + optional LLM explanation).
 */

import { PerformerExplainer, actionKeysToCtaLabels } from './performerExplainer.js';
import { StructuredFact } from './factTypes.js';

/**
 * @param {StructuredFact} fact
 * @param {{ explanation?: string | null }} explained
 * @param {Record<string, unknown>} [legacyFields]
 * @returns {Record<string, unknown>}
 */
export function buildIntakePayloadFromFact(fact, explained, legacyFields = {}) {
  const factJson = fact.toJSON();
  const actions = fact.allowedActions;
  const explanation =
    typeof explained.explanation === 'string' && explained.explanation.trim()
      ? explained.explanation.trim()
      : null;

  return {
    ...legacyFields,
    event: fact.event,
    fact: factJson,
    data: fact.data,
    actions,
    explanation,
    ...(explanation ? { response: explanation, message: explanation } : {}),
    ctaButtons: actionKeysToCtaLabels(actions),
  };
}

/**
 * @param {StructuredFact} fact
 * @param {Record<string, unknown>} [context]
 * @param {Record<string, unknown>} [legacyFields]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function explainFactForIntake(fact, context = {}, legacyFields = {}) {
  const explainer = new PerformerExplainer({ context });
  const explained = await explainer.explain(fact);
  return buildIntakePayloadFromFact(fact, explained, legacyFields);
}

/**
 * @param {StructuredFact | Record<string, unknown>} factLike
 * @returns {StructuredFact}
 */
export function asStructuredFact(factLike) {
  return factLike instanceof StructuredFact ? factLike : new StructuredFact(factLike);
}
