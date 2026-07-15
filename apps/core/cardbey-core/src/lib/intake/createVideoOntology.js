/**
 * Deterministic create_video ontology — used for broker hard-route and chat-downgrade guard.
 */

import { INTENT_SUBTYPES } from './intakeIntentOntology.js';

const VIDEO_SUBTYPE =
  INTENT_SUBTYPES.find((s) => s.subtype === 'video_creation') ?? null;

/**
 * @param {string} userMessage
 */
export function matchesCreateVideoOntology(userMessage) {
  const m = String(userMessage ?? '').trim();
  if (!m || !VIDEO_SUBTYPE) return false;
  return VIDEO_SUBTYPE.matchPatterns.some((pattern) => pattern.test(m));
}
