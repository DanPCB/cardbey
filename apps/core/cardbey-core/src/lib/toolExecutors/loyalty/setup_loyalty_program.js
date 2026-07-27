/**

 * setup_loyalty_program — governed proactive runway loyalty setup.

 * plan → review → apply → resume

 */



import { EXECUTION_STATES } from '../../telemetry/executionStates.js';

import {

  applyLoyaltyProgramDraft,

  assertStoreOwnership,

  gatherLoyaltyProgramContext,

  loyaltyDraftArtifact,

  planLoyaltyProgramDraft,

  runLoyaltyProgramPipeline,

} from './loyaltyProgramDraft.js';

import { emitLoyaltyProgramTelemetry, LOYALTY_TELEMETRY } from './loyaltyProgramTelemetry.js';
import { logLoyaltyContractDiagnostic } from '../../loyalty/loyaltyContractDiagnostics.js';



function pickString(...values) {

  for (const value of values) {

    if (typeof value === 'string' && value.trim()) return value.trim();

  }

  return '';

}



function resolvePreseededDraft(input) {

  if (input?.preseededDraft && typeof input.preseededDraft === 'object') return input.preseededDraft;

  if (input?.payload?.preseededDraft && typeof input.payload.preseededDraft === 'object') {

    return input.payload.preseededDraft;

  }

  return null;

}



/**

 * @param {object} [input]

 * @param {object} [context]

 */

export async function execute(input = {}, context = {}) {

  const storeId =

    pickString(input?.storeId, context?.storeId) ||

    pickString(context?.stepOutputs?.segment_loyal_customers?.storeId);

  const userId = pickString(input?.userId, context?.userId, context?.createdBy);

  const missionId = pickString(input?.missionId, context?.missionId);

  const requirements = pickString(input?.requirements, input?.prompt, input?.goal);

  const source = pickString(input?.source, 'performer_quick_action');

  const tenantId = pickString(context?.tenantId, userId);

  const preseededDraft = resolvePreseededDraft(input);



  emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.PLAN, { missionId, storeId, userId, source });



  const access = await assertStoreOwnership({ storeId, userId });

  if (!access.ok) {

    return {

      status: access.status ?? 'blocked',

      blocker: access.blocker,

      output: {

        executionState: EXECUTION_STATES.BLOCKED,

        tool: 'setup_loyalty_program',

        message: access.blocker?.message,

      },

    };

  }



  const draftInput =

    input?.draft && typeof input.draft === 'object'

      ? input.draft

      : input?.loyaltyProgramDraft && typeof input.loyaltyProgramDraft === 'object'

        ? input.loyaltyProgramDraft

        : null;



  if (input?.apply === true || input?.confirmed === true) {

    if (!draftInput) {

      return {

        status: 'blocked',

        blocker: {

          code: 'DRAFT_REQUIRED',

          message: 'Approve a loyalty program draft before applying.',

        },

        output: { executionState: EXECUTION_STATES.BLOCKED, phase: 'awaiting_owner_review' },

      };

    }

    const applied = await applyLoyaltyProgramDraft({

      storeId,

      userId,

      tenantId,

      missionId,

      draft: draftInput,

      source,

      runtimeContext: context,

      artifactId: pickString(draftInput.artifactId),

    });

    if (!applied.ok) {

      emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.APPLY_FAILED, {

        missionId,

        storeId,

        reason: applied.blocker?.code ?? applied.blocker?.message,

      });

      return {

        status: applied.status ?? 'blocked',

        blocker: applied.blocker,

        output: {

          executionState: EXECUTION_STATES.BLOCKED,

          phase: 'awaiting_owner_review',

          loyaltyProgramDraft: draftInput,

        },

      };

    }

    return {

      status: 'ok',

      output: {

        executionState: EXECUTION_STATES.EXECUTED,

        phase: 'applied',

        status: 'completed',

        missionId,

        storeId,

        tool: 'setup_loyalty_program',

        programId: applied.programId,

        loyaltyProgramId: applied.programId,

        storePromoId: applied.writeResult?.storePromoId ?? applied.promo?.promoId ?? null,

        writeResult: applied.writeResult,

        promo: applied.promo,

        suitcaseItemId: applied.suitcaseItemId,

        loyaltyProgramDraft: draftInput,

        message: 'Loyalty program applied to your store.',

      },

    };

  }



  const storeContext = await gatherLoyaltyProgramContext({ storeId, userId, tenantId });

  const pipeline = await runLoyaltyProgramPipeline({

    storeId,

    userId,

    businessCategory: access.store.type,

    requirements,

    context,

  });



  const planned = planLoyaltyProgramDraft({

    store: access.store,

    context: storeContext,

    pipeline,

    preseededDraft,

    requirements,

  });

  if (planned?.draft) {
    logLoyaltyContractDiagnostic('setup_loyalty_program_input', planned.draft, {
      missionId: context?.missionId ?? input?.missionId ?? null,
      storeId,
    });
  }



  if (planned.blocked) {

    return {

      status: 'blocked',

      blocker: planned.blocker,

      output: {

        executionState: EXECUTION_STATES.BLOCKED,

        tool: 'setup_loyalty_program',

        phase: 'needs_owner_input',

        missingFields: planned.missingFields,

        evidence: planned.evidence,

        confidence: planned.confidence,

        message: planned.blocker?.message,

      },

    };

  }



  const draft = planned.draft;

  const artifact = loyaltyDraftArtifact(draft, missionId);

  draft.artifactId = artifact.artifactId;



  emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.DRAFT_READY, {

    missionId,

    storeId,

    confidence: planned.confidence,

    mode: planned.mode,

  });

  emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.AWAITING_REVIEW, { missionId, storeId, artifactId: artifact.artifactId });



  return {

    status: 'ok',

    output: {

      executionState: EXECUTION_STATES.PLANNED,

      phase: 'awaiting_owner_review',

      status: 'needs_owner_review',

      artifactType: 'loyalty_program_draft',

      missionId,

      storeId,

      storeName: access.store.name,

      source,

      tool: 'setup_loyalty_program',

      confidence: planned.confidence,

      evidence: planned.evidence,

      missingFields: planned.missingFields ?? [],

      loyaltyProgramDraft: draft,

      creationContract: planned.creationContract ?? draft.creationContract ?? null,

      sourceMode: planned.creationContract?.sourceMode ?? draft.sourceMode ?? null,

      recommendations: planned.creationContract?.recommendations ?? draft.recommendations ?? null,

      artifacts: [artifact],

      analysis: pipeline.segmentOut,

      tiers: pipeline.tiers,

      offers: pipeline.offers,

      suggestedActions: [

        { action: 'apply_loyalty_program', label: 'Apply to store' },

        { action: 'save_loyalty_draft', label: 'Save draft' },

        { action: 'improve_with_performer', label: 'Improve with Performer' },

      ],

      message: 'Loyalty program draft is ready for your review.',

    },

  };

}



export default execute;


