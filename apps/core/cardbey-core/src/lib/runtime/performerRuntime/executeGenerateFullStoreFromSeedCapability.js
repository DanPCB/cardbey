/**
 * Performer runtime — generate_full_store_from_seed (Activation Experience V2).
 * Creates governed draft store only — never publishes or activates.
 */

import { executeGenerateFullStoreFromSeedRunway } from '../../businessIngestion/generateFullStoreFromSeedService.js';
import { getRuntimeByMissionId } from './runtimeState.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';
import { recordRuntimeAuthorityPathUsed } from './runtimeAuthorityGuard.js';
import { logStoreBuild } from '../../businessIngestion/storeBuildTrace.js';

/**
 * @param {{
 *   missionId?: string | null;
 *   seedId: string;
 *   userId?: string | null;
 *   batchId?: string | null;
 *   source?: string;
 * }} params
 */
export async function executeGenerateFullStoreFromSeedCapability(params) {
  const seedId = String(params.seedId ?? '').trim();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';

  recordRuntimeAuthorityPathUsed({
    route: '/api/performer/runtime/capabilities/generate-full-store-from-seed',
    toolName: 'generate_full_store_from_seed',
    userId: userId || null,
    missionId: missionId || null,
    source: params.source ?? 'activation_page',
  });

  const runtimeCtx = missionId ? getRuntimeByMissionId(missionId) : null;
  const runtimeId = runtimeCtx?.runtimeId ?? `rt-gen-store:${seedId}`;

  markRuntimeOwnedContext(
    {
      missionId: missionId || null,
      userId: userId || null,
      source: 'performer_runtime_generate_full_store',
      seedId,
    },
    runtimeId,
  );

  logStoreBuild('STORE_BUILD_CAPABILITY', {
    seedId,
    missionId: missionId || null,
    userId: userId || null,
    source: params.source ?? 'activation_page',
  });

  const result = await executeGenerateFullStoreFromSeedRunway({
    seedId,
    userId: userId || null,
    batchId: params.batchId ?? null,
    source: params.source ?? 'activation_page',
    missionId: missionId || null,
  });

  return {
    ok: result.ok,
    status: result.status,
    output: result.output
      ? {
          ...result.output,
          performerId: result.output.performerId ?? runtimeId,
        }
      : null,
    error: result.error ?? (result.ok ? null : { message: result.message }),
    code: result.error?.code ?? null,
    message: result.message,
    failureStage: result.failureStage ?? result.error?.stage ?? null,
    missionId: result.output?.missionId ?? (missionId || null),
    nextRoute: result.output?.nextRoute ?? null,
    draftStoreId: result.output?.draftStoreId ?? null,
    completenessScore: result.output?.completenessScore ?? null,
  };
}
