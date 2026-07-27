/**
 * Performer runtime — read-only analyze_store execution (no store/draft/publish mutation).
 */
import { dispatchTool } from '../../toolDispatcher.js';
import { getRuntimeByMissionId } from './runtimeState.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';

/**
 * @param {{
 *   missionId: string;
 *   storeId: string;
 *   draftId?: string | null;
 *   generationRunId?: string | null;
 *   focus?: string | null;
 *   userId?: string | null;
 *   tenantId?: string | null;
 * }} params
 * @returns {Promise<{ ok: boolean; status: 'completed' | 'failed' | 'blocked'; output?: object; error?: string; code?: string }>}
 */
export async function executeAnalyzeStoreCapability(params) {
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';
  const storeId = typeof params.storeId === 'string' ? params.storeId.trim() : '';

  if (!missionId) {
    return { ok: false, status: 'failed', error: 'mission_id_required', code: 'mission_id_required' };
  }
  if (!storeId) {
    return {
      ok: false,
      status: 'blocked',
      error: 'store_id_required',
      code: 'store_id_required',
    };
  }

  const runtimeCtx = getRuntimeByMissionId(missionId);
  const runtimeId = runtimeCtx?.runtimeId ?? `rt-analyze:${missionId}`;

  const input = {
    storeId,
    ...(params.draftId ? { draftId: String(params.draftId).trim() } : {}),
    ...(params.generationRunId
      ? { generationRunId: String(params.generationRunId).trim() }
      : {}),
    ...(params.focus ? { focus: String(params.focus).trim() } : { focus: 'performance' }),
  };

  const toolContext = markRuntimeOwnedContext(
    {
      missionId,
      storeId,
      source: 'performer_runtime_analyze_store',
      readOnly: true,
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    },
    runtimeId,
  );

  const result = await dispatchTool('analyze_store', input, toolContext);

  if (result.status === 'blocked') {
    return {
      ok: false,
      status: 'blocked',
      error: result.blocker?.message ?? 'Store analysis blocked',
      code: result.blocker?.code ?? 'blocked',
      output: result.output,
    };
  }

  if (result.status === 'failed') {
    return {
      ok: false,
      status: 'failed',
      error: result.error?.message ?? 'Store analysis failed',
      code: result.error?.code ?? 'analyze_store_failed',
      output: result.output,
    };
  }

  return {
    ok: true,
    status: 'completed',
    output: result.output && typeof result.output === 'object' ? result.output : {},
  };
}
