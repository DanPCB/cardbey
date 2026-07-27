/**
 * Ontology advisor — scores INTENT_SUBTYPES matchPatterns (parity with intakeIntentResolver).
 */

import { INTENT_SUBTYPES } from '../../intake/intakeIntentOntology.js';
import { createHypothesis, clampScore, pushHypothesis } from '../hypothesisUtils.js';

/**
 * @param {string} userMessage
 */
export function rankOntologySubtypes(userMessage) {
  const lower = userMessage.toLowerCase();
  const ranked = [];
  for (const st of INTENT_SUBTYPES) {
    let score = 0;
    for (const re of st.matchPatterns) {
      if (re.test(userMessage)) score += 2;
    }
    if (st.family === 'content_edit' && /\b(image|photo|picture|logo)\b/i.test(lower)) {
      score = Math.max(0, score - 3);
    }
    if (st.subtype === 'improve_store_general' && /\b(photo|image|picture|banner|hero|cover|background)\b/i.test(lower)) {
      score = Math.max(0, score - 4);
    }
    ranked.push({ st, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * @param {import('../constants.js').BeliefSnapshot} belief
 * @param {import('../advisorTypes.js').AdvisorInput} input
 * @returns {import('../hypothesisUtils.js').Hypothesis[]}
 */
export function ontologyAdvisor(belief, input) {
  const hypotheses = [];
  const userMessage = String(input.originalUserMessage ?? input.userMessage ?? '').trim();
  if (!userMessage) return hypotheses;

  const ranked = rankOntologySubtypes(userMessage);
  const top = ranked[0];
  if (!top || top.score <= 0) return hypotheses;

  const normalizedScore = clampScore(Math.min(0.92, 0.55 + top.score * 0.06));
  const intent = top.st.subtype === 'create_store_flow' ? 'create_store' : top.st.subtype;

  pushHypothesis(
    hypotheses,
    createHypothesis({
      intent,
      score: normalizedScore,
      advisorId: 'ontology',
      suggestedTool: top.st.defaultTool,
      requiredContext: [...top.st.requiredContext],
      evidence: [
        {
          source: 'rules',
          fact: `ontology:${top.st.family}/${top.st.subtype}`,
          weight: top.score,
        },
      ],
    }),
  );

  return hypotheses;
}
