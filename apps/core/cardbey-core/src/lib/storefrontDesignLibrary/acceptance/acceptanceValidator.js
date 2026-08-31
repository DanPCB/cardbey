/**
 * Validate acceptance decisions (fail closed).
 */

import { ACCEPTANCE_STATUSES } from './acceptanceRecord.js';

/**
 * @param {{
 *   decision: string,
 *   confirm: boolean,
 *   applyToDraftPreview?: boolean,
 * }} body
 * @param {{
 *   safeForPreview?: boolean,
 *   projectionPresent?: boolean,
 *   fingerprint?: string|null,
 * }} context
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAcceptanceRequest(body, context = {}) {
  /** @type {string[]} */
  const errors = [];
  const decision = String(body?.decision ?? '').trim().toLowerCase();
  if (decision !== 'accept' && decision !== 'reject') {
    errors.push('decision_must_be_accept_or_reject');
  }
  // Explicit confirmation required (safe execution / Autonomy Level 3+)
  if (body?.confirm !== true) {
    errors.push('confirm_required');
  }
  if (!context.projectionPresent) {
    errors.push('projection_missing');
  }
  if (decision === 'accept' && context.safeForPreview === false) {
    errors.push('not_safe_for_preview');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {import('./acceptanceRecord.js').ProjectionAcceptanceRecord | null} acceptance
 * @param {string | null} currentFingerprint
 */
export function isAcceptanceCurrent(acceptance, currentFingerprint) {
  if (!acceptance || acceptance.status !== 'accepted') return false;
  if (!acceptance.projectionFingerprint || !currentFingerprint) return false;
  return acceptance.projectionFingerprint === currentFingerprint;
}

/**
 * @param {unknown} status
 */
export function isAcceptanceStatus(status) {
  return typeof status === 'string' && ACCEPTANCE_STATUSES.includes(status);
}
