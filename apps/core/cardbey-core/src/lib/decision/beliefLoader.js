/**
 * Unified belief loader — single read model for intake decision loop (Phase 1).
 * Merges fragmented session stores; read-only in shadow mode.
 */

import { BELIEF_LOADER_VERSION } from './constants.js';
import { noteDivergence } from './beliefDivergence.js';
import { peekIntakeWorkflowContext } from '../intake/intakeWorkflowContext.js';
import { peekPendingDocumentExtraction } from '../intake/storeCandidate.js';
import {
  pickMemorySummary,
  pickUnifiedMemory,
  resolveIntakeDraftId,
  resolveIntakeMissionId,
  resolveIntakeStoreId,
} from '../intake/intakeMemoryContext.js';
import {
  getPersistedIntentResolution,
  makePersistedIntentStorageKey,
} from '../intake/intakePersistedIntentStore.js';
import { resolveIntakeV2ActorKey, resolveIntakeV2TenantKey } from '../intake/intakeV2ActorContext.js';
import {
  activeGoalSupersedesUploadClarify,
  isUploadPendingConfirmationWorkflow,
} from './uploadBeliefContext.js';

function strip(value) {
  return String(value ?? '').trim() || null;
}

/**
 * @param {unknown} ctx
 * @returns {Record<string, unknown>}
 */
function asObject(ctx) {
  return ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? /** @type {Record<string, unknown>} */ (ctx) : {};
}

/**
 * @param {Record<string, unknown>} workflowCtx
 * @returns {import('./constants.js').BeliefWorkflow | null}
 */
function workflowFromIntakeMap(workflowCtx) {
  const aw = workflowCtx.activeWorkflow;
  if (!aw || typeof aw !== 'object') return null;
  const type = strip(/** @type {Record<string, unknown>} */ (aw).type);
  const status = strip(/** @type {Record<string, unknown>} */ (aw).status);
  if (!type) return null;
  return {
    type,
    status: status ?? 'unknown',
    source: strip(/** @type {Record<string, unknown>} */ (aw).source) ?? undefined,
  };
}

/**
 * @param {object} opts
 * @returns {import('./constants.js').BeliefLastUpload | null}
 */
function lastUploadFromSources(opts) {
  const {
    workflowCtx,
    pendingExtraction,
    intentSourceContext,
    clientContext,
  } = opts;

  const uploaded = workflowCtx?.uploadedAsset;
  const uploadedObj = uploaded && typeof uploaded === 'object' ? uploaded : null;
  const pending = pendingExtraction ?? uploadedObj?.documentExtraction ?? null;
  const isc = asObject(intentSourceContext);
  const client = asObject(clientContext);

  const imageRef =
    strip(uploadedObj?.imageDataUrl) ??
    strip(pending?.imageDataUrl) ??
    strip(isc.pendingImageDataUrl) ??
    strip(client.pendingImageDataUrl);

  const ocrText =
    strip(uploadedObj?.rawOcrText) ??
    strip(pending?.rawOcrText) ??
    strip(pending?.storeCandidate?.rawOcrText);

  const documentType =
    strip(pending?.documentType) ??
    strip(pending?.storeCandidate?.documentType) ??
    strip(uploadedObj?.documentExtraction?.documentType);

  const entities = workflowCtx?.entities;
  const entityObj = entities && typeof entities === 'object' ? entities : {};
  const businessName =
    strip(entityObj.businessName) ??
    strip(entityObj.storeName) ??
    strip(pending?.storeCandidate?.extractedFields?.businessName?.value);

  const evidenceId =
    strip(isc.evidenceId) ??
    strip(uploadedObj?.evidenceId) ??
    strip(client.evidenceId);
  const attachmentId =
    strip(isc.attachmentId) ??
    strip(uploadedObj?.attachmentId) ??
    strip(client.attachmentId);
  const contentHash =
    strip(isc.contentHash) ??
    strip(uploadedObj?.contentHash) ??
    strip(client.contentHash);
  const sourceMessageId =
    strip(isc.sourceMessageId) ??
    strip(client.sourceMessageId);

  if (!imageRef && !ocrText && !businessName && !evidenceId && !attachmentId) return null;

  return {
    imageRef,
    ocrText,
    documentType,
    businessName,
    evidenceId,
    attachmentId,
    contentHash,
    sourceMessageId,
    sessionKey: strip(opts.sessionKey),
    at: strip(workflowCtx?.updatedAt) ?? new Date().toISOString(),
  };
}

/**
 * @param {object} opts
 * @returns {import('./constants.js').BeliefPendingClarify | null}
 */
function pendingClarifyFromSources(opts) {
  const { workflowCtx, intentSourceContext, lastUpload, activeGoal } = opts;
  const isc = asObject(intentSourceContext);
  const wf = workflowFromIntakeMap(workflowCtx ?? {});
  const uploadSuperseded = activeGoalSupersedesUploadClarify(activeGoal);

  if (!uploadSuperseded && isc.uploadedAssetPending === true && lastUpload) {
    return {
      type: 'upload_goal',
      question: 'What would you like to do with this upload?',
      options: [{ id: 'create_store' }, { id: 'import_catalog' }, { id: 'analyze_document' }],
    };
  }

  if (
    !uploadSuperseded &&
    wf?.status === 'pending_confirmation' &&
    lastUpload &&
    isUploadPendingConfirmationWorkflow(wf, workflowCtx)
  ) {
    return {
      type: 'upload_goal',
      question: 'Upload awaiting goal selection',
      options: Array.isArray(workflowCtx?.pendingIntents)
        ? workflowCtx.pendingIntents.map((id) => ({ id: String(id) }))
        : [{ id: 'create_store' }],
    };
  }

  const assetAction = strip(isc.assetAction);
  if (assetAction && !isc.fromAskSelection) {
    return {
      type: 'workflow_continuation',
      question: `Pending asset action: ${assetAction}`,
      options: [{ id: assetAction }],
    };
  }

  return null;
}

/**
 * @param {object} opts
 * @returns {import('./constants.js').BeliefActiveGoal | null}
 */
function activeGoalFromSources(opts) {
  const { persistedIntent, unifiedMemory, memorySummary, intentSourceContext } = opts;
  const isc = asObject(intentSourceContext);

  if (strip(isc.fromAskSelection)) {
    return {
      intent: strip(isc.fromAskSelection) ?? strip(isc.assetAction) ?? 'unknown',
      confidence: 0.95,
    };
  }

  if (persistedIntent?.chosenTool) {
    return {
      intent: strip(persistedIntent.subtype) ?? strip(persistedIntent.chosenTool) ?? 'unknown',
      confidence: 0.85,
    };
  }

  const um = asObject(unifiedMemory);
  if (strip(um.missionType)) {
    return { intent: strip(um.missionType) ?? 'unknown', confidence: 0.7 };
  }

  const mem = asObject(memorySummary);
  if (strip(mem.missionType)) {
    return { intent: strip(mem.missionType) ?? 'unknown', confidence: 0.65 };
  }

  return null;
}

/**
 * Load unified belief snapshot for an intake turn.
 *
 * @param {object} opts
 * @param {import('express').Request} [opts.req]
 * @param {string | null} [opts.sessionId]
 * @param {string | null} [opts.sessionKey]
 * @param {Record<string, unknown>} [opts.currentContext]
 * @param {Record<string, unknown> | null} [opts.intentSourceContext]
 * @param {import('../context/contextTypes.ts').UserContext | null} [opts.contextEngineUserContext]
 * @param {Record<string, unknown> | null} [opts.intakeMemoryBundle]
 * @param {Record<string, unknown>} [opts.body]
 * @returns {Promise<import('./constants.js').BeliefSnapshot>}
 */
export async function loadBelief(opts = {}) {
  const divergences = /** @type {import('./constants.js').BeliefDivergence[]} */ ([]);
  const sourcesLoaded = [];

  const sessionId = strip(opts.sessionId) ?? strip(opts.sessionKey) ?? 'unknown';
  const sessionKey = strip(opts.sessionKey) ?? sessionId;
  const currentContext = asObject(opts.currentContext);
  const intentSourceContext = opts.intentSourceContext ?? null;
  const body = asObject(opts.body);
  const req = opts.req ?? null;

  const userId =
    strip(req?.user?.id) ??
    strip(body.userId) ??
    strip(currentContext.userId);
  const guest = !userId && Boolean(req?.guestId ?? req?.guest?.id ?? req?.guestSessionId);
  const actorId = (req ? resolveIntakeV2ActorKey(req) : null) ?? (userId ? `u:${userId}` : null);

  // --- Source 1: Context engine ---
  const ctxEngine = opts.contextEngineUserContext ?? null;
  if (ctxEngine) sourcesLoaded.push('context_engine');

  // --- Source 2: Workflow map + store candidate ---
  const workflowCtx = sessionKey ? peekIntakeWorkflowContext(sessionKey) : null;
  const pendingExtraction = sessionKey ? peekPendingDocumentExtraction(sessionKey) : null;
  if (workflowCtx || pendingExtraction) sourcesLoaded.push('workflow_map');

  // --- Source 3: Client currentContext ---
  if (Object.keys(currentContext).length > 0) sourcesLoaded.push('client_context');

  // --- Source 4: intentSourceContext handoff bag ---
  if (intentSourceContext && Object.keys(intentSourceContext).length > 0) {
    sourcesLoaded.push('intent_source_context');
  }

  // --- Source 5: Memory facade bundle ---
  const memoryBundle = opts.intakeMemoryBundle ?? null;
  if (memoryBundle) sourcesLoaded.push('memory_facade');

  // --- Source 6: Persisted intent ---
  let persistedIntent = null;
  if (req && actorId) {
    const tenantKey = resolveIntakeV2TenantKey(req);
    const storeIdHint = resolveIntakeStoreId(currentContext);
    const draftIdHint = resolveIntakeDraftId(currentContext);
    const missionIdHint = resolveIntakeMissionId({ body, currentContext });
    persistedIntent = getPersistedIntentResolution({
      actorKey: actorId,
      tenantKey,
      missionId: missionIdHint,
      storeId: storeIdHint,
      draftId: draftIdHint,
    });
    if (persistedIntent) sourcesLoaded.push('persisted_intent');
  }

  const memorySummary = pickMemorySummary(currentContext);
  const unifiedMemory = pickUnifiedMemory(currentContext);

  // --- Resolve anchors (priority: context engine > client > memory bundle) ---
  const storeIdClient = resolveIntakeStoreId(currentContext);
  const storeIdEngine = strip(ctxEngine?.activeStoreId);
  const storeIdBundle =
    memoryBundle?.store?.id != null ? strip(memoryBundle.store.id) : null;
  noteDivergence(
    divergences,
    'storeId',
    storeIdEngine,
    'context_engine',
    storeIdClient,
    'client_context',
  );
  noteDivergence(
    divergences,
    'storeId',
    storeIdClient,
    'client_context',
    storeIdBundle,
    'memory_facade',
  );
  const storeId = storeIdEngine ?? storeIdClient ?? storeIdBundle ?? null;

  const draftIdEngine = strip(ctxEngine?.activeDraftId);
  const draftIdClient = resolveIntakeDraftId(currentContext);
  noteDivergence(divergences, 'draftId', draftIdEngine, 'context_engine', draftIdClient, 'client_context');
  const draftId = draftIdEngine ?? draftIdClient ?? null;

  const missionIdEngine = strip(ctxEngine?.activeMissionId);
  const missionIdClient = resolveIntakeMissionId({ body, currentContext });
  noteDivergence(
    divergences,
    'missionId',
    missionIdEngine,
    'context_engine',
    missionIdClient,
    'client_context',
  );
  const missionId = missionIdEngine ?? missionIdClient ?? strip(persistedIntent?.missionId) ?? null;

  // --- Workflow ---
  const workflowEngine =
    ctxEngine?.currentWorkflow != null
      ? {
          type: String(ctxEngine.currentWorkflow),
          status: 'active',
          source: 'context_engine',
        }
      : null;
  const workflowMap = workflowCtx ? workflowFromIntakeMap(workflowCtx) : null;
  if (workflowEngine && workflowMap) {
    noteDivergence(
      divergences,
      'workflowType',
      workflowEngine.type,
      'context_engine',
      workflowMap.type,
      'workflow_map',
    );
  }
  const workflow = workflowEngine ?? workflowMap ?? null;

  const lastUpload = lastUploadFromSources({
    workflowCtx,
    pendingExtraction,
    intentSourceContext,
    clientContext: currentContext,
    sessionKey,
  });

  const clientHasUpload = Boolean(
    strip(asObject(intentSourceContext).pendingImageDataUrl) ||
      strip(currentContext.pendingImageDataUrl),
  );
  if (lastUpload && !clientHasUpload && workflowCtx) {
    noteDivergence(divergences, 'hasUpload', true, 'workflow_map', false, 'client_handoff');
  }

  const activeGoal = activeGoalFromSources({
    persistedIntent,
    unifiedMemory,
    memorySummary,
    intentSourceContext,
  });

  const pendingClarify = pendingClarifyFromSources({
    workflowCtx,
    intentSourceContext,
    lastUpload,
    activeGoal,
  });

  const blockers = [];
  if (guest && !draftId) blockers.push('guest_may_need_sign_in_for_publish');
  if (!storeId && !draftId && activeGoal?.intent === 'create_campaign') {
    blockers.push('needs_store_for_campaign');
  }

  return {
    sessionId,
    sessionKey,
    identity: {
      guest: guest || (!userId && Boolean(actorId?.startsWith('g:'))),
      actorId,
      userId,
    },
    anchors: { storeId, draftId, missionId },
    workflow,
    lastUpload,
    activeGoal,
    pendingClarify,
    blockers,
    sourcesLoaded,
    divergences,
    loadedAt: new Date().toISOString(),
    loaderVersion: BELIEF_LOADER_VERSION,
  };
}

/**
 * Compact summary for logs and API shadow field.
 * @param {import('./constants.js').BeliefSnapshot} belief
 */
export function summarizeBeliefForShadow(belief) {
  return {
    sessionKey: belief.sessionKey,
    storeId: belief.anchors.storeId,
    draftId: belief.anchors.draftId,
    missionId: belief.anchors.missionId,
    hasLastUpload: Boolean(belief.lastUpload),
    uploadBusinessName: belief.lastUpload?.businessName ?? null,
    pendingClarifyType: belief.pendingClarify?.type ?? null,
    activeGoal: belief.activeGoal?.intent ?? null,
    workflowType: belief.workflow?.type ?? null,
    sourcesLoaded: belief.sourcesLoaded,
    divergenceCount: belief.divergences.length,
    materialDivergence: belief.divergences.some((d) =>
      ['storeId', 'hasUpload', 'workflowType', 'businessName'].includes(d.field),
    ),
  };
}

/** @internal tests */
export { makePersistedIntentStorageKey };
