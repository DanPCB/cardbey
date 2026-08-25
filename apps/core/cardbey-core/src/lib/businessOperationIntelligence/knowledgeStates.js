/**
 * Knowledge-state vocabulary for Business Operation Intelligence.
 * Preserves fact vs inference vs assumption vs recommendation so later
 * simulation/monetization cannot confuse real-world evidence with guidance.
 *
 * Authority order (highest wins for identity fields):
 *   USER_DEFINED > DISCOVERED_FACT > AI_INFERENCE > RECOMMENDATION > ASSUMPTION
 */

export const KNOWLEDGE_STATES = Object.freeze({
  USER_DEFINED: 'USER_DEFINED',
  DISCOVERED_FACT: 'DISCOVERED_FACT',
  AI_INFERENCE: 'AI_INFERENCE',
  RECOMMENDATION: 'RECOMMENDATION',
  ASSUMPTION: 'ASSUMPTION',
});

/** @type {Readonly<Record<string, number>>} */
export const KNOWLEDGE_STATE_AUTHORITY = Object.freeze({
  [KNOWLEDGE_STATES.USER_DEFINED]: 50,
  [KNOWLEDGE_STATES.DISCOVERED_FACT]: 40,
  [KNOWLEDGE_STATES.AI_INFERENCE]: 30,
  [KNOWLEDGE_STATES.RECOMMENDATION]: 20,
  [KNOWLEDGE_STATES.ASSUMPTION]: 10,
});

/**
 * @param {string | null | undefined} state
 * @returns {number}
 */
export function knowledgeAuthority(state) {
  return KNOWLEDGE_STATE_AUTHORITY[String(state || '')] ?? 0;
}

/**
 * True when `next` may replace `current` (equal or higher authority, or current empty).
 * @param {string | null | undefined} current
 * @param {string | null | undefined} next
 */
export function canOverwriteKnowledgeState(current, next) {
  if (!current) return true;
  return knowledgeAuthority(next) >= knowledgeAuthority(current);
}

/**
 * @param {string | null | undefined} state
 */
export function isKnowledgeState(state) {
  return Object.prototype.hasOwnProperty.call(KNOWLEDGE_STATES, String(state || ''));
}
