/**

 * Performer runtime — setup_loyalty_program UI action + apply.

 */



import { getExecutor } from '../../toolExecutors/index.js';

import { recordRuntimeAuthorityPathUsed } from './runtimeAuthorityGuard.js';

import { markRuntimeOwnedContext } from './runtimeOwnership.js';

import { getRuntimeByMissionId } from './runtimeState.js';

import {

  ensureLoyaltySetupMission,

  persistLoyaltySetupStepOutput,

} from '../../toolExecutors/loyalty/ensureLoyaltySetupMission.js';

import { assertStoreOwnership } from '../../toolExecutors/loyalty/loyaltyProgramDraft.js';



function pickString(...values) {

  for (const value of values) {

    if (typeof value === 'string' && value.trim()) return value.trim();

  }

  return '';

}



/**

 * @param {{

 *   missionId?: string | null;

 *   storeId?: string | null;

 *   userId?: string | null;

 *   tenantId?: string | null;

 *   source?: string | null;

 *   requirements?: string | null;

 *   confirmed?: boolean;

 *   apply?: boolean;

 *   draft?: object | null;

 *   loyaltyProgramDraft?: object | null;

 *   preseededDraft?: object | null;

 *   payload?: object | null;

 * }} params

 */

export async function executeSetupLoyaltyProgramRuntimeTool(params) {

  const storeId = pickString(params.storeId, params.payload?.storeId);

  const userId = pickString(params.userId);

  const source = pickString(params.source, params.payload?.source, 'performer_quick_action');

  const requirements = pickString(params.requirements, params.payload?.requirements);

  const confirmed = params.confirmed === true || params.apply === true;

  let missionId = pickString(params.missionId, params.payload?.missionId);



  recordRuntimeAuthorityPathUsed({

    route: '/api/performer/runtime/ui-action',

    toolName: confirmed ? 'apply_loyalty_program' : 'setup_loyalty_program',

    userId: userId || null,

    missionId: missionId || null,

    source,

  });



  const runtimeCtx = missionId ? getRuntimeByMissionId(missionId) : null;

  const runtimeId = runtimeCtx?.runtimeId ?? `rt-loyalty:${missionId || storeId || 'anon'}`;



  const ownedCtx = markRuntimeOwnedContext(

    {

      missionId: missionId || null,

      storeId: storeId || null,

      userId: userId || null,

      source: 'performer_runtime_setup_loyalty_program',

      runtimeOwned: true,

      performerRuntimeOwned: true,

    },

    runtimeId,

  );



  const executor = getExecutor('setup_loyalty_program');

  if (!executor?.execute) {

    return {

      ok: false,

      status: 'failed',

      error: { code: 'EXECUTOR_MISSING', message: 'setup_loyalty_program executor is not registered' },

    };

  }



  const draft =

    params.draft && typeof params.draft === 'object'

      ? params.draft

      : params.loyaltyProgramDraft && typeof params.loyaltyProgramDraft === 'object'

        ? params.loyaltyProgramDraft

        : params.payload?.draft && typeof params.payload.draft === 'object'

          ? params.payload.draft

          : params.payload?.loyaltyProgramDraft && typeof params.payload.loyaltyProgramDraft === 'object'

            ? params.payload.loyaltyProgramDraft

            : null;



  const preseededDraft =

    params.preseededDraft && typeof params.preseededDraft === 'object'

      ? params.preseededDraft

      : params.payload?.preseededDraft && typeof params.payload.preseededDraft === 'object'

        ? params.payload.preseededDraft

        : null;



  if (!confirmed) {

    const access = await assertStoreOwnership({ storeId, userId });

    if (!access.ok) {

      return {

        ok: false,

        status: 'blocked',

        error: access.blocker ?? { message: 'Store access denied' },

      };

    }

    const ensured = await ensureLoyaltySetupMission({

      missionId,

      storeId,

      userId,

      tenantId: pickString(params.tenantId, userId),

      storeName: access.store?.name,

      source,

    });

    missionId = ensured.missionId;

  }



  const result = await executor.execute(

    {

      storeId,

      userId,

      missionId,

      requirements,

      source,

      preseededDraft,

      ...(confirmed ? { confirmed: true, apply: true, draft } : {}),

    },

    {

      ...ownedCtx,

      missionId,

      storeId,

      userId,

      tenantId: pickString(params.tenantId, userId),

      createdBy: userId,

      runtimeOwned: true,

      performerRuntimeOwned: true,

    },

  );



  const output = result?.output && typeof result.output === 'object' ? result.output : {};

  const blocked = result?.status === 'blocked' || result?.status === 'failed';



  if (!blocked && missionId) {

    await persistLoyaltySetupStepOutput({

      missionId,

      storeId,

      output: { ...output, tool: 'setup_loyalty_program', missionId, storeId },

    });

  }



  if (blocked) {

    return {

      ok: false,

      status: 'blocked',

      error: result?.blocker ?? result?.error ?? { message: 'Loyalty setup blocked' },

      output,

      missionId: missionId || null,

    };

  }



  return {

    ok: true,

    status: output.status === 'completed' ? 'completed' : 'needs_owner_review',

    missionId: output.missionId ?? missionId ?? null,

    output,

    artifacts: Array.isArray(output.artifacts) ? output.artifacts : [],

    suggestedActions: Array.isArray(output.suggestedActions) ? output.suggestedActions : [],

  };

}


