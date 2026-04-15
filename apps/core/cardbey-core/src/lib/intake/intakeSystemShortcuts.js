/**
 * Deterministic system shortcuts only.
 *
 * Phase 5B removed store-setup regex fast-paths from Intake V2 classification.
 * Phase 5B/5C: first-hop store creation detection is owned by `intakeClassifier.js` (LLM + routing rules),
 * so this shortcuts layer must not duplicate store/mini-website phrase matching.
 */

/**
 * @param {object} input
 * @param {string} input.userMessage
 * @param {{ userId?: string | null, isGuest?: boolean }} input.auth
 * @returns {{ type: 'create_store', intentMode: 'store'|'website' } | { type: 'auth_required', message: string } | { type: 'missing_store', message: string } | null}
 */
export function detectIntent(input) {
  const raw = String(input?.userMessage ?? '').trim();
  if (!raw) return null;
  return null;
}
