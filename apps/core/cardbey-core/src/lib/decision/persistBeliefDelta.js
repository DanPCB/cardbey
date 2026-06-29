/**
 * Persist belief deltas through existing stores (Phase 1 foundation).
 * Phase 1: callable but not yet wired into main intake response path.
 */

import { stashIntakeWorkflowContext, persistUploadedAssetWorkflow } from '../intake/intakeWorkflowContext.js';
import { setPersistedIntentResolution } from '../intake/intakePersistedIntentStore.js';
import { getContextProvider, isContextEngineEnabled } from '../context/contextEngine.js';

function strip(value) {
  return String(value ?? '').trim() || null;
}

/**
 * @typedef {object} BeliefDelta
 * @property {string} [sessionKey]
 * @property {import('./constants.js').BeliefWorkflow | null} [workflow]
 * @property {import('./constants.js').BeliefLastUpload | null} [lastUpload]
 * @property {import('./constants.js').BeliefPendingClarify | null} [pendingClarify]
 * @property {import('./constants.js').BeliefActiveGoal | null} [activeGoal]
 * @property {string | null} [storeId]
 * @property {string | null} [draftId]
 * @property {string | null} [missionId]
 * @property {string | null} [userId]
 * @property {string | null} [actorKey]
 * @property {string | null} [tenantKey]
 */

/**
 * Apply a partial belief update to backing stores.
 *
 * @param {BeliefDelta} delta
 * @returns {Promise<{ applied: string[]; skipped: string[] }>}
 */
export async function persistBeliefDelta(delta = {}) {
  const applied = [];
  const skipped = [];
  const sessionKey = strip(delta.sessionKey);

  if (sessionKey && delta.workflow) {
    stashIntakeWorkflowContext(sessionKey, {
      activeWorkflow: {
        type: delta.workflow.type,
        status: delta.workflow.status,
        source: delta.workflow.source ?? 'belief_delta',
      },
      ...(delta.pendingClarify?.type === 'upload_goal'
        ? { pendingIntents: delta.pendingClarify.options?.map((o) => o.id) ?? ['create_store'] }
        : {}),
    });
    applied.push('workflow_map');
  } else if (delta.workflow && !sessionKey) {
    skipped.push('workflow_map:no_session_key');
  }

  if (sessionKey && delta.lastUpload?.ocrText && delta.lastUpload.imageRef) {
    // Reuse existing artifact shape when storeCandidate already stashed elsewhere.
    const patch = {
      uploadedAsset: {
        imageDataUrl: delta.lastUpload.imageRef,
        rawOcrText: delta.lastUpload.ocrText,
      },
      entities: delta.lastUpload.businessName
        ? { businessName: delta.lastUpload.businessName, storeName: delta.lastUpload.businessName }
        : undefined,
    };
    stashIntakeWorkflowContext(sessionKey, patch);
    applied.push('last_upload_patch');
  }

  if (
    delta.activeGoal &&
    delta.actorKey &&
    delta.tenantKey &&
    (delta.missionId || delta.storeId || delta.draftId)
  ) {
    setPersistedIntentResolution({
      actorKey: delta.actorKey,
      tenantKey: delta.tenantKey,
      missionId: delta.missionId ?? null,
      storeId: delta.storeId ?? null,
      draftId: delta.draftId ?? null,
      family: null,
      subtype: delta.activeGoal.intent,
      chosenTool: delta.activeGoal.intent,
      executionPath: null,
      source: 'belief_delta',
    });
    applied.push('persisted_intent');
  }

  if (
    isContextEngineEnabled() &&
    delta.userId &&
    sessionKey &&
    (delta.storeId || delta.draftId || delta.missionId || delta.workflow)
  ) {
    try {
      const provider = getContextProvider();
      const patch = {
        ...(delta.storeId ? { activeStoreId: delta.storeId } : {}),
        ...(delta.draftId ? { activeDraftId: delta.draftId } : {}),
        ...(delta.missionId ? { activeMissionId: delta.missionId } : {}),
        ...(delta.workflow?.type ? { currentWorkflow: delta.workflow.type } : {}),
      };
      if (Object.keys(patch).length > 0) {
        await provider.updateContext(delta.userId, sessionKey, patch);
        applied.push('context_engine');
      }
    } catch (err) {
      skipped.push(`context_engine:${err?.message ?? 'error'}`);
    }
  }

  return { applied, skipped };
}

/** Re-export for callers that stash full document extraction artifacts. */
export { persistUploadedAssetWorkflow };
