/**
 * DANH: validate_and_fix_next_steps — await postMissionSummary with timeout before mission status=completed.
 */

import { runPostMissionCompletionSummary } from './postMissionSummary.js';

/** @type {number} */
export const POST_MISSION_SUMMARY_TIMEOUT_MS = 10_000;

/**
 * @param {number} ms
 * @returns {Promise<never>}
 */
function postMissionSummaryTimeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('post_mission_summary_timeout')), ms);
  });
}

/**
 * Non-throwing wrapper for pipeline runners — logs and swallows errors/timeouts.
 * @param {Parameters<typeof runPostMissionCompletionSummary>[0]} opts
 * @param {number} [timeoutMs]
 */
export async function awaitPostMissionCompletionSummaryWithTimeout(
  opts,
  timeoutMs = POST_MISSION_SUMMARY_TIMEOUT_MS,
) {
  try {
    await Promise.race([runPostMissionCompletionSummary(opts), postMissionSummaryTimeout(timeoutMs)]);
  } catch (err) {
    console.warn('[postMissionSummary] failed or timed out', {
      missionId: opts?.missionId,
      err: err?.message || err,
    });
  }
}
