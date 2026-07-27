/**
 * Plan artifact validation — lightweight schema checks before execute dispatch.
 */

import { VIDEO_PLAN_SCHEMA } from './planApprovalConstants.js';

/**
 * @param {unknown} plan
 * @param {string} [schemaId]
 * @returns {{ ok: boolean, errors?: string[], plan?: object }}
 */
export function validatePlanArtifact(plan, schemaId = VIDEO_PLAN_SCHEMA) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, errors: ['plan must be an object'] };
  }
  const p = /** @type {Record<string, unknown>} */ (plan);
  const errors = [];

  if (schemaId === VIDEO_PLAN_SCHEMA) {
    if (typeof p.script !== 'string' || !p.script.trim()) {
      errors.push('script is required');
    }
    if (!Array.isArray(p.scenes) || p.scenes.length === 0) {
      errors.push('scenes must be a non-empty array');
    } else {
      for (const scene of p.scenes) {
        if (!scene || typeof scene !== 'object') {
          errors.push('each scene must be an object');
          break;
        }
      }
    }
    if (typeof p.style !== 'string' || !p.style.trim()) {
      errors.push('style is required');
    }
    const duration = Number(p.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push('duration must be a positive number');
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, plan: p };
}

/**
 * @param {object} stepOutput
 * @returns {object | null}
 */
export function extractVideoPlanFromStepOutput(stepOutput) {
  const out = stepOutput?.output;
  if (!out || typeof out !== 'object') return null;
  if (out.plan && typeof out.plan === 'object') return out.plan;
  return out;
}
