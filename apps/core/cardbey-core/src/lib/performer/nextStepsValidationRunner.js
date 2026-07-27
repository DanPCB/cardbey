/**
 * DANH: validate_and_fix_next_steps — async blackboard read/fix/write after mission completion.
 */

import { appendEvent, getEvents } from '../missionBlackboard.js';
import {
  normalizeInputSteps,
  nextStepsToHints,
  validateAndFixNextSteps,
} from './tools/validateNextSteps.js';

const STORE_CREATION_TYPES = new Set([
  'store',
  'create_store',
  'store_creation',
  'mini_website',
  'miniwebsite',
  'create_mini_website',
]);

/**
 * @param {string|null|undefined} missionType
 * @returns {boolean}
 */
export function isStoreCreationMissionType(missionType) {
  if (missionType == null) return false;
  let s = String(missionType).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (s === 'miniwebsite' || s === 'create_mini_website') s = 'mini_website';
  return STORE_CREATION_TYPES.has(s);
}

/**
 * @param {string} missionId
 * @returns {Promise<unknown[]|null>}
 */
export async function readLatestNextActionHints(missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return null;
  const { events } = await getEvents(mid, { limit: 500 });
  let latest = null;
  for (const e of events || []) {
    if (e?.eventType === 'next_action_hints') latest = e.payload;
  }
  if (!latest || typeof latest !== 'object') return null;
  const hints = /** @type {{ hints?: unknown[] }} */ (latest).hints;
  return Array.isArray(hints) ? hints : null;
}

/**
 * DANH: emit before async validation — UI must see pending=true before first render.
 * @param {string} missionId
 * @param {boolean} pending
 */
export async function emitNextStepsValidationPending(missionId, pending) {
  await appendEvent(missionId, 'next_steps_validation_pending', {
    pending,
    missionId,
  });
}

/**
 * @param {object} opts
 * @param {string} opts.missionId
 * @param {unknown} [opts.steps] — hints or NextStep rows; when omitted, read latest blackboard hints
 * @returns {Promise<import('./tools/validateNextSteps.js').ValidationReport|null>}
 */
export async function runValidateAndFixNextSteps({ missionId, steps }) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return null;

  let rawSteps = steps;
  if (rawSteps == null) {
    rawSteps = await readLatestNextActionHints(mid);
  }
  if (!rawSteps || (Array.isArray(rawSteps) && rawSteps.length === 0)) {
    await emitNextStepsValidationPending(mid, false);
    return validateAndFixNextSteps([], mid);
  }

  const normalized = normalizeInputSteps(rawSteps);
  const report = validateAndFixNextSteps(normalized, mid);

  if (report.status !== 'clean') {
    const hints = nextStepsToHints(report.steps_final);
    await appendEvent(mid, 'next_action_hints', {
      hints,
      validated: true,
      validationStatus: report.status,
    });
  }

  if (report.status === 'needs_manual_review') {
    await appendEvent(mid, 'next_steps_manual_review', {
      missionId: mid,
      reason: 'next_steps validation failed — manual review needed',
      snapshot: report,
    });
  }

  await emitNextStepsValidationPending(mid, false);
  return report;
}

/**
 * Fire-and-forget validation work only — caller must have already emitted pending=true.
 * @param {object} opts
 * @param {string} opts.missionId
 * @param {unknown} [opts.steps]
 */
export function runValidateAndFixNextStepsInBackground({ missionId, steps }) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;

  void (async () => {
    try {
      await runValidateAndFixNextSteps({ missionId: mid, steps });
    } catch (e) {
      console.warn('[nextStepsValidation] validate_and_fix_next_steps failed:', e?.message || e);
      try {
        await emitNextStepsValidationPending(mid, false);
      } catch {
        /* ignore */
      }
    }
  })();
}

/**
 * @deprecated Prefer await emitNextStepsValidationPending + runValidateAndFixNextStepsInBackground.
 * @param {object} opts
 * @param {string} opts.missionId
 * @param {string|null|undefined} opts.missionType
 * @param {unknown} [opts.steps]
 */
export async function scheduleValidateAndFixNextStepsAfterCompletion({ missionId, missionType, steps }) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid || !isStoreCreationMissionType(missionType)) return;
  await emitNextStepsValidationPending(mid, true);
  runValidateAndFixNextStepsInBackground({ missionId: mid, steps });
}
