/**
 * Performer runtime — activate_business_space (Business Activation Runway V2).
 * All Business Space creation from discovery flows through this capability.
 */

import { executeActivateBusinessSpaceRunway } from '../../businessIngestion/ActivationRunwayService.js';
import { getRuntimeByMissionId } from './runtimeState.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';
import { recordRuntimeAuthorityPathUsed } from './runtimeAuthorityGuard.js';

/**
 * @param {{
 *   missionId?: string | null;
 *   seedId: string;
 *   userId: string;
 *   confirmed?: boolean;
 *   tenantId?: string | null;
 * }} params
 */
export async function executeActivateBusinessSpaceCapability(params) {
  const seedId = String(params.seedId ?? '').trim();
  const userId = String(params.userId ?? '').trim();
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';

  recordRuntimeAuthorityPathUsed({
    route: '/api/performer/runtime/capabilities/activate-business-space',
    toolName: 'activate_business_space',
    userId,
    missionId: missionId || null,
    source: 'business_activation_runway',
  });

  const runtimeCtx = missionId ? getRuntimeByMissionId(missionId) : null;
  const runtimeId = runtimeCtx?.runtimeId ?? `rt-activate:${seedId}`;

  markRuntimeOwnedContext(
    {
      missionId: missionId || null,
      userId,
      source: 'performer_runtime_activate_business_space',
      seedId,
    },
    runtimeId,
  );

  const result = await executeActivateBusinessSpaceRunway({
    seedId,
    userId,
    confirmed: params.confirmed === true,
    missionId: missionId || null,
  });

  return {
    ok: result.ok,
    status: result.status,
    output: result.output ?? null,
    error: result.error ?? (result.ok ? null : { message: result.message }),
    code: result.error?.code ?? null,
    message: result.message,
    missionId: (result.output?.activationMissionId ?? missionId) || null,
    storeId: result.output?.businessSpaceId ?? null,
  };
}
