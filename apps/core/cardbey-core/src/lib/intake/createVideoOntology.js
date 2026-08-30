/**
 * Deterministic create_video ontology — used for broker hard-route and chat-downgrade guard.
 */

import { INTENT_SUBTYPES } from './intakeIntentOntology.js';

const VIDEO_SUBTYPE =
  INTENT_SUBTYPES.find((s) => s.subtype === 'video_creation') ?? null;

const VIDEO_TOOLS = new Set([
  'create_video',
  'video_generate_multimodal',
  'video_plan',
  'video_audio',
  'video_post_production',
  'promotional_video',
  'promotion_video',
]);

/**
 * @param {string} userMessage
 */
export function matchesCreateVideoOntology(userMessage) {
  const m = String(userMessage ?? '').trim();
  if (!m || !VIDEO_SUBTYPE) return false;
  return VIDEO_SUBTYPE.matchPatterns.some((pattern) => pattern.test(m));
}

/**
 * True when this turn should route through Creative Factory video ownership.
 *
 * @param {string} userMessage
 * @param {string} [tool]
 */
export function isCreativeVideoIntakeTurn(userMessage, tool) {
  const t = String(tool ?? '').trim().toLowerCase();
  if (VIDEO_TOOLS.has(t)) return true;
  // Ontology only — do not use broad "video"/"clip" mention heuristics as a Factory trigger.
  return matchesCreateVideoOntology(userMessage);
}

/**
 * @param {string} userMessage
 * @param {string} [intentLabel]
 */
export function isVideoOwnedByCreativeFactory(userMessage, intentLabel) {
  return isCreativeVideoIntakeTurn(userMessage, intentLabel);
}
