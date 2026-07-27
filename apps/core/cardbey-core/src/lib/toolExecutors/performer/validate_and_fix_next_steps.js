/**
 * DANH: validate_and_fix_next_steps — Performer / dispatcher tool for next_action_hints repair.
 */

import { runValidateAndFixNextSteps } from '../../performer/nextStepsValidationRunner.js';

/**
 * @param {object} input
 * @param {string} [input.mission_id]
 * @param {string} [input.missionId]
 * @param {unknown[]} [input.steps]
 * @param {object} [context]
 * @param {string} [context.missionId]
 */
export async function execute(input = {}, context = {}) {
  const missionId =
    (typeof input.mission_id === 'string' && input.mission_id.trim()) ||
    (typeof input.missionId === 'string' && input.missionId.trim()) ||
    (typeof context?.missionId === 'string' && context.missionId.trim()) ||
    '';
  if (!missionId) {
    return {
      status: 'failed',
      error: { code: 'MISSING_MISSION_ID', message: 'mission_id is required' },
    };
  }

  const report = await runValidateAndFixNextSteps({
    missionId,
    steps: input.steps,
  });

  return {
    status: 'ok',
    output: report,
  };
}
