/**
 * Performer Runtime — execution kernel entry (Phase 1.5-A).
 *
 * performerRuntime.execute() is the authoritative Performer execution entry.
 * Delegates to executeRuntimeAction; wraps legacy systems without replacing them.
 */

import { executeRuntimeAction } from './executeRuntimeAction.js';
import { runtimeContextFromRequest } from './runtimeContext.js';
import { resolveRuntimeContext, updateRuntimeState } from './runtimeState.js';
import { emitRuntimeStreamEvent } from './unifiedRuntimeStream.js';

/**
 * @typedef {import('./executeRuntimeAction.js').ExecuteRuntimeActionRequest} PerformerRuntimeExecuteRequest
 */

/**
 * Primary Performer Runtime execution entry.
 *
 * @param {PerformerRuntimeExecuteRequest} request
 */
export async function execute(request) {
  const req = request && typeof request === 'object' ? request : {};
  const seed = runtimeContextFromRequest(req);
  const ctx = resolveRuntimeContext(seed);

  updateRuntimeState(ctx.runtimeId, { runtimeState: 'running' });

  if (ctx.missionId) {
    await emitRuntimeStreamEvent({
      missionId: ctx.missionId,
      runtimeId: ctx.runtimeId,
      eventType: 'lifecycle.started',
      payload: { source: req.source ?? 'performer_runtime' },
    });
  }

  const result = await executeRuntimeAction({
    ...req,
    runtimeId: ctx.runtimeId,
    missionId: ctx.missionId ?? req.missionId ?? null,
    source: req.source ?? 'performer_runtime',
  });

  return result;
}

export const performerRuntime = { execute };

export default performerRuntime;
