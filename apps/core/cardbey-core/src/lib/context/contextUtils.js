/**
 * Shared Context Engine utilities.
 */

import { randomUUID } from 'node:crypto';

export const CONTEXT_VERSION = '1.0.0';

export function generateContextId() {
  return randomUUID();
}

/**
 * Deep merge: objects merge recursively; arrays are replaced.
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 */
export function deepMergeContext(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return target;
  }
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMergeContext(/** @type {Record<string, unknown>} */ (out[key]), /** @type {Record<string, unknown>} */ (value));
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * @param {import('./contextTypes.ts').Interaction} interaction
 * @returns {import('./contextTypes.ts').InputContext | null}
 */
export function extractInputContextFromInteraction(interaction) {
  const input = interaction?.input;
  if (!input || typeof input !== 'object') return null;

  const raw = /** @type {Record<string, unknown>} */ (input);
  const text = String(raw.text ?? raw.userMessage ?? raw.message ?? '').trim();
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  const hasImage = Boolean(raw.image || raw.imageDataUrl);
  const hasAttachment = attachments.length > 0 || hasImage || Boolean(raw.files);

  if (!text && !hasAttachment) return null;

  return {
    rawText: text,
    hasAttachment,
    hasImage,
    attachmentTypes: attachments
      .map((a) => (a && typeof a === 'object' ? String(/** @type {Record<string, unknown>} */ (a).mimeType ?? '') : ''))
      .filter(Boolean),
    extractedText: typeof raw.extractedText === 'string' ? raw.extractedText : null,
    detectedType: typeof raw.detectedType === 'string' ? raw.detectedType : null,
  };
}

/**
 * @param {unknown} input
 * @returns {import('./contextTypes.ts').InteractionType}
 */
export function detectInteractionType(input) {
  if (!input || typeof input !== 'object') return 'text_input';
  const raw = /** @type {Record<string, unknown>} */ (input);
  if (raw.files || raw.attachments) return 'file_upload';
  if (raw.image || raw.imageDataUrl) return 'image_upload';
  if (raw.audio) return 'voice_input';
  if (raw.type === 'checkpoint') return 'checkpoint_resolved';
  if (raw.type === 'mission_complete') return 'mission_completed';
  if (raw.type === 'mission_created') return 'mission_created';
  if (raw.type === 'mission_failed') return 'mission_failed';
  if (raw.type === 'user_feedback') return 'user_feedback';
  if (raw.type === 'tool_execution') return 'tool_execution';
  return 'text_input';
}
