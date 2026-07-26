/**
 * Persist belief deltas through existing stores (Phase 1 foundation).
 * Phase 1: callable but not yet wired into main intake response path.
 */

import { stashIntakeWorkflowContext, persistUploadedAssetWorkflow } from '../intake/intakeWorkflowContext.js';
import { setPersistedIntentResolution } from '../intake/intakePersistedIntentStore.js';
import { getContextProvider, isContextEngineEnabled } from '../context/contextEngine.js';
import { activeGoalSupersedesUploadClarify } from './uploadBeliefContext.js';

function strip(value) {
  return String(value ?? '').trim() || null;
}

const UPLOAD_ASK_SELECTION_TOOLS = new Set([
  'create_store',
  'replace_store_catalog',
  'ingest_asset_for_intent_detection',
]);

/**
 * @param {BeliefDelta} delta
 */
function shouldClearStaleUploadContext(delta) {
  if (delta.clearUploadContext === true) return true;
  if (delta.clearPendingClarify === true && delta.pendingClarify === null) return true;
  if (delta.uploadAskHandled === true) return true;
  const goal = strip(delta.activeGoal?.intent);
  if (goal && activeGoalSupersedesUploadClarify(delta.activeGoal)) return true;
  return false;
}

/**
 * Clear stale upload workflow memory so later turns are not hijacked by uploadedAssetPending.
 * @param {string | null | undefined} sessionKey
 * @param {{ activeGoal?: string | null }} [extras]
 */
export async function clearStaleUploadBeliefContext(sessionKey, extras = {}) {
  const key = strip(sessionKey);
  if (!key) {
    return { applied: [], skipped: ['clear_upload_context:no_session_key'] };
  }

  const activeGoal = strip(extras.activeGoal);
  stashIntakeWorkflowContext(key, {
    uploadContextCleared: true,
    uploadedAssetPending: false,
    uploadedAsset: null,
    pendingIntents: null,
    entities: null,
    storeCandidate: null,
    documentExtraction: null,
    ...(activeGoal
      ? {
          activeWorkflow: {
            type: activeGoal,
            status: 'active',
            source: 'belief_delta_clear_upload',
          },
        }
      : {
          activeWorkflow: {
            type: 'upload_resolved',
            status: 'completed',
            source: 'belief_delta_clear_upload',
          },
        }),
  });

  return { applied: ['clear_upload_context'], skipped: [] };
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
 * @property {boolean} [clearUploadContext]
 * @property {boolean} [clearPendingClarify]
 * @property {boolean} [uploadAskHandled]
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

  if (sessionKey && shouldClearStaleUploadContext(delta)) {
    const cleared = await clearStaleUploadBeliefContext(sessionKey, {
      activeGoal: strip(delta.activeGoal?.intent),
    });
    applied.push(...cleared.applied);
    skipped.push(...cleared.skipped);
  }

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

  if (sessionKey && delta.lastUpload?.imageRef) {
    // Overwrite prior upload state — never layer stale uploads across missions.
    const patch = {
      uploadContextCleared: false,
      uploadedAssetPending: true,
      uploadedAsset: {
        imageDataUrl: delta.lastUpload.imageRef,
        rawOcrText: delta.lastUpload.ocrText ?? null,
        evidenceId: delta.lastUpload.evidenceId ?? null,
        attachmentId: delta.lastUpload.attachmentId ?? null,
        contentHash: delta.lastUpload.contentHash ?? null,
        sourceMessageId: delta.lastUpload.sourceMessageId ?? null,
      },
      entities: delta.lastUpload.businessName
        ? { businessName: delta.lastUpload.businessName, storeName: delta.lastUpload.businessName }
        : undefined,
      activeWorkflow: {
        type: 'upload_intake',
        status: 'pending_confirmation',
        source: 'belief_delta_last_upload',
      },
      pendingIntents: ['create_store', 'import_catalog', 'analyze_document'],
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
