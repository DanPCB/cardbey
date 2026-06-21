/**
 * create_mini_website — website-mode store build via structured_store_build.
 * Routed through unified dispatch as create_store with intentMode: website.
 */

import { EXECUTION_STATES } from '../../telemetry/executionStates.js';
import { execute as structuredStoreBuild } from '../store/structured_store_build.js';

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const missionId =
    (typeof context?.missionId === 'string' ? context.missionId.trim() : '') ||
    (typeof input?.missionId === 'string' ? input.missionId.trim() : '');

  if (!missionId) {
    return {
      status: 'blocked',
      blocker: {
        code: 'MISSION_REQUIRED',
        message: 'Mini website creation requires an active mission context',
      },
      output: {
        executionState: EXECUTION_STATES.BLOCKED,
        intentMode: 'website',
        intentLabel: 'create_mini_website',
      },
    };
  }

  const enrichedInput = {
    ...input,
    intentMode: 'website',
    mode: 'mini_website',
  };
  const enrichedContext = {
    ...context,
    intentLabel: 'create_mini_website',
    intentMode: 'website',
  };

  const result = await structuredStoreBuild(enrichedInput, enrichedContext);
  const ok = result?.status === 'ok';
  const executionState = ok ? EXECUTION_STATES.EXECUTED : EXECUTION_STATES.FAILED;

  return {
    ...result,
    output: {
      ...(result?.output && typeof result.output === 'object' ? result.output : {}),
      executionState,
      intentMode: 'website',
      intentLabel: 'create_mini_website',
      dispatchedVia: 'unified_dispatch',
    },
  };
}

export default execute;
