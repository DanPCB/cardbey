/**
 * Records a conditional pipeline branch choice without faking side effects.
 * Used after mission.conditional steps to persist branch metadata for downstream tools.
 */

import { EXECUTION_STATES } from '../../telemetry/executionStates.js';

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  // @pure-transform: branch metadata only; mission runner persists step outputJson.
  const branch = typeof input?.branch === 'string' ? input.branch.trim() : 'default';
  const label = typeof input?.label === 'string' ? input.label.trim() : branch;
  const missionId = context?.missionId ?? input?.missionId ?? null;

  return {
    status: 'ok',
    output: {
      branch,
      label,
      missionId,
      executionState: EXECUTION_STATES.EXECUTED,
      recordedAt: new Date().toISOString(),
      message: `Conditional branch "${label}" recorded for pipeline continuation`,
    },
  };
}

export default execute;
