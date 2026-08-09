/**
 * URI Phase 2 — Rights-Aware Resource Reuse Pilot journey.
 * Intent → discovery → select → revalidate → reuse plan → confirm → custody-aware draft use.
 */

import { Features } from '../../config/features.js';
import { explainCandidate } from './candidateExplainer.js';
import { evaluateResourceRights } from './rightsIntelligence.js';
import { buildReusePlan } from './reusePlanner.js';
import { revalidateSourceAndRights } from './sourceRevalidation.js';
import {
  CUSTODY_MODE,
  CUSTODY_MODE_PHASE2_ENABLED,
  CUSTODY_MODE_DISABLED,
  POLICY_VERSION,
} from './types.js';
import {
  getSession,
  listCandidateSnapshots,
  getCandidateSnapshot,
  createSelection,
  createReuseIntent,
  createReuseDecision,
  getReuseDecision,
  updateReuseDecision,
  createAttributionSnapshot,
  createRetrievalJob,
  updateRetrievalJob,
  createExternalResourceUse,
  getExternalResourceUse,
  getReuseIntent,
} from './reuseRepository.js';
import { upsertResourceRecord } from './resourceIndex.js';
import {
  materializeDestination,
  isDestinationAllowed,
} from './destinationAdapters.js';
import { DESTINATION_ADAPTER } from './types.js';

function reusePilotEnabled() {
  return Boolean(
    Features.universalResourceIntelligence?.v1 &&
      Features.universalResourceIntelligence?.reusePilotV1,
  );
}

function isCustodyAllowed(mode) {
  return CUSTODY_MODE_PHASE2_ENABLED.includes(mode);
}

/**
 * Select a candidate from a search session and create reuse intent + awaiting decision.
 */
export async function selectResourceCandidate(prisma, input = {}) {
  if (!reusePilotEnabled()) {
    return { ok: false, error: 'uri_reuse_pilot_disabled' };
  }
  const sessionId = input.sessionId;
  const snapshotId = input.candidateSnapshotId;
  if (!sessionId || !snapshotId) {
    return { ok: false, error: 'sessionId_and_candidateSnapshotId_required' };
  }

  const session = await getSession(prisma, sessionId);
  if (!session) return { ok: false, error: 'session_not_found' };

  const snap = await getCandidateSnapshot(prisma, snapshotId);
  if (!snap || snap.sessionId !== sessionId) {
    return { ok: false, error: 'candidate_not_found' };
  }

  const resource = snap.payloadJson;
  // Ensure in-memory index has the record for reuse planner
  upsertResourceRecord(resource);

  const selection = await createSelection(prisma, {
    sessionId,
    candidateSnapshotId: snapshotId,
    resourceId: resource.id,
    userId: input.userId || session.userId,
  });

  const preferred =
    input.custodyMode ||
    snap.explanationJson?.custodyMode ||
    CUSTODY_MODE.PROVIDER_HOSTED;
  if (!isCustodyAllowed(preferred)) {
    return {
      ok: false,
      error: 'custody_mode_disabled',
      disabled: CUSTODY_MODE_DISABLED,
      preferred,
    };
  }

  const intent = await createReuseIntent(prisma, {
    selectionId: selection.id,
    sessionId,
    resourceId: resource.id,
    intendedPurpose:
      input.intendedPurpose ||
      session.intentJson?.purpose ||
      'commercial_digital_display',
    targetType: input.targetType || 'display_playlist_draft',
    targetId: input.targetId || null,
    preferredCustodyMode: preferred,
    payload: {
      explanation: snap.explanationJson,
      duplicateOf: input.duplicateOf || null,
    },
  });

  const rights = snap.rightsJson || evaluateResourceRights(resource);
  const plan = await buildReusePlan({
    resourceIds: [resource.id],
    policyContext: input.policyContext,
    custodyMode: preferred,
  });

  const decision = await createReuseDecision(prisma, {
    reuseIntentId: intent.id,
    reusePlan: plan.reusePlan,
    custodyMode: preferred,
    rightsDecision: rights,
    policyVersion: POLICY_VERSION,
  });

  return {
    ok: true,
    selection,
    reuseIntent: intent,
    reuseDecision: decision,
    explanation: snap.explanationJson,
    resource: {
      id: resource.id,
      title: resource.title,
      sourceId: resource.sourceId,
    },
    next: {
      confirm: 'POST /api/resource-intelligence/reuse/confirm',
      cancel: 'POST /api/resource-intelligence/reuse/cancel',
    },
  };
}

/**
 * Cancel before execution.
 */
export async function cancelReuseDecision(prisma, input = {}) {
  if (!reusePilotEnabled()) return { ok: false, error: 'uri_reuse_pilot_disabled' };
  const decision = await getReuseDecision(prisma, input.reuseDecisionId);
  if (!decision) return { ok: false, error: 'decision_not_found' };
  if (decision.status === 'EXECUTED') {
    return { ok: false, error: 'already_executed' };
  }
  const updated = await updateReuseDecision(prisma, decision.id, {
    status: 'CANCELLED',
    cancelledAt: new Date().toISOString(),
    userConfirmed: false,
  });
  return { ok: true, reuseDecision: updated };
}

/**
 * Confirm + execute custody-aware reuse into draft playlist (never auto-publish).
 */
export async function confirmAndExecuteReuse(prisma, input = {}) {
  if (!reusePilotEnabled()) return { ok: false, error: 'uri_reuse_pilot_disabled' };
  if (!input.confirm) return { ok: false, error: 'confirmation_required' };

  const decision = await getReuseDecision(prisma, input.reuseDecisionId);
  if (!decision) return { ok: false, error: 'decision_not_found' };
  if (decision.status === 'CANCELLED') return { ok: false, error: 'cancelled' };
  if (decision.status === 'EXECUTED') {
    return { ok: true, alreadyExecuted: true, reuseDecisionId: decision.id };
  }

  const custodyMode = input.custodyMode || decision.custodyMode;
  if (!isCustodyAllowed(custodyMode)) {
    return { ok: false, error: 'custody_mode_disabled', mode: custodyMode };
  }
  if (CUSTODY_MODE_DISABLED.includes(custodyMode)) {
    return { ok: false, error: 'custody_mode_not_activated', mode: custodyMode };
  }

  // Resolve resource from session candidates via reuse intent chain
  const intentRows = await findIntentResource(prisma, decision);
  if (!intentRows.ok) return intentRows;
  const { resource, reuseIntent, selection, session } = intentRows;

  const revalidation = revalidateSourceAndRights(resource, {
    overrides: input.revalidationOverrides || {},
    policyContext: input.policyContext || {},
  });
  if (!revalidation.ok) {
    await updateReuseDecision(prisma, decision.id, {
      status: 'BLOCKED',
      rightsDecisionJson: revalidation.rights || decision.rightsDecisionJson,
    });
    return {
      ok: false,
      error: revalidation.code || 'revalidation_failed',
      message: revalidation.message,
      blocked: true,
      revalidation,
    };
  }

  await updateReuseDecision(prisma, decision.id, {
    status: 'CONFIRMED',
    userConfirmed: true,
    confirmedAt: new Date().toISOString(),
    rightsDecisionJson: revalidation.rights,
  });

  const retrieval = await runRetrieval(prisma, {
    decisionId: decision.id,
    custodyMode,
    resource: revalidation.resource,
    simulateFailure: input.simulateRetrievalFailure === true,
    retry: input.retry === true,
  });

  if (!retrieval.ok && !input.allowPartial) {
    return {
      ok: false,
      error: 'retrieval_failed',
      retrieval,
      retryable: true,
    };
  }

  const attribution = await createAttributionSnapshot(prisma, {
    reuseDecisionId: decision.id,
    text:
      resource.sourceId === 'src_pexels'
        ? `Photos provided by Pexels — ${resource.sourceMetadata?.photographer || 'creator'}`
        : `Credit: ${resource.sourceMetadata?.photographer || resource.title}`,
    creator: resource.sourceMetadata?.photographer || null,
    provider: resource.sourceId,
    license: resource.sourceMetadata?.license || null,
    sourceUrl: resource.canonicalUrl || resource.previewUrl || null,
    payload: { custodyMode, binaryStored: false },
  });

  const destination =
    input.destination ||
    reuseIntent.targetType ||
    DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT;
  if (!isDestinationAllowed(destination)) {
    return { ok: false, error: 'destination_not_allowlisted', destination };
  }

  const draft = await materializeDestination(prisma, destination, {
    resource: revalidation.resource,
    custodyMode,
    userId: input.userId || selection?.userId || session?.userId,
    tenantId: input.tenantId || 'uri-pilot',
    storeId: input.storeId || 'uri-pilot-draft',
    intendedPurpose: reuseIntent.intendedPurpose,
    playlistName: input.playlistName,
    draftStoreId: input.draftStoreId || null,
    collectionName: input.collectionName || null,
    workspaceId: input.workspaceId || null,
  });
  if (!draft.ok) {
    return { ok: false, error: draft.error || 'destination_materialize_failed', draft };
  }

  const use = await createExternalResourceUse(prisma, {
    userId: input.userId || selection?.userId || null,
    sessionId: session?.id || reuseIntent.sessionId,
    selectionId: selection?.id || reuseIntent.selectionId,
    reuseIntentId: reuseIntent.id,
    reuseDecisionId: decision.id,
    resourceId: resource.id,
    intendedPurpose: reuseIntent.intendedPurpose,
    sourceMetadata: {
      title: resource.title,
      sourceId: resource.sourceId,
      remoteId: resource.remoteId,
      canonicalUrl: resource.canonicalUrl,
      previewUrl: resource.previewUrl,
      license: resource.sourceMetadata?.license,
      photographer: resource.sourceMetadata?.photographer,
      capturedAt: new Date().toISOString(),
    },
    rightsDecision: revalidation.rights,
    policyVersion: POLICY_VERSION,
    attributionSnapshotId: attribution.id,
    custodyMode,
    targetType: destination,
    targetId: draft.targetId || draft.playlistId || null,
    playlistId: draft.playlistId || null,
    suitcaseItemId: draft.suitcaseItemId || null,
    signageAssetId: draft.signageAssetId || null,
    retrievalJobId: retrieval.job?.id || null,
    retrievalResult: retrieval.result,
    binaryStored: false,
    status: 'ACTIVE',
  });

  await updateReuseDecision(prisma, decision.id, {
    status: 'EXECUTED',
    userConfirmed: true,
    confirmedAt: decision.confirmedAt || new Date().toISOString(),
  });

  return {
    ok: true,
    externalResourceUse: use,
    attribution,
    retrieval,
    draft: {
      ...draft,
      published: false,
      active: false,
      note: 'Draft only — not published to live stores/devices',
    },
    destination,
    binaryStored: false,
    custodyMode,
    authority: 'universal_resource_intelligence',
  };
}

async function findIntentResource(prisma, decision) {
  const reuseIntent = await getReuseIntent(prisma, decision.reuseIntentId);
  if (!reuseIntent) return { ok: false, error: 'reuse_intent_not_found' };

  const session = await getSession(prisma, reuseIntent.sessionId);
  const snaps = await listCandidateSnapshots(prisma, reuseIntent.sessionId);
  const snap =
    snaps.find((s) => s.resourceId === reuseIntent.resourceId) ||
    snaps.find((s) => s.id === reuseIntent.payloadJson?.candidateSnapshotId);
  const resource = snap?.payloadJson;
  if (!resource) return { ok: false, error: 'resource_snapshot_missing' };

  return {
    ok: true,
    resource,
    reuseIntent,
    selection: { id: reuseIntent.selectionId, userId: session?.userId },
    session,
  };
}

async function runRetrieval(prisma, { decisionId, custodyMode, resource, simulateFailure, retry }) {
  let job = await createRetrievalJob(prisma, {
    reuseDecisionId: decisionId,
    custodyMode,
    status: 'RUNNING',
    attempt: 1,
    binaryStored: false,
  });

  if (simulateFailure && !retry) {
    job = await updateRetrievalJob(prisma, job.id, {
      status: 'FAILED',
      attempt: 1,
      errorCode: 'RETRIEVAL_TRANSIENT',
      resultJson: { ok: false },
      binaryStored: false,
    });
    return { ok: false, job, result: { errorCode: 'RETRIEVAL_TRANSIENT' } };
  }

  const attempt = simulateFailure && retry ? 2 : 1;
  const result = {
    ok: true,
    custodyMode,
    mode:
      custodyMode === CUSTODY_MODE.PULL_ON_USE
        ? 'metadata_pull_reference'
        : custodyMode === CUSTODY_MODE.PROVIDER_HOSTED
          ? 'provider_url_reference'
          : 'reference_only',
    url: resource.canonicalUrl || resource.previewUrl || null,
    binaryStored: false,
    attempt,
  };

  job = await updateRetrievalJob(prisma, job.id, {
    status: 'COMPLETED',
    attempt,
    errorCode: null,
    resultJson: result,
    binaryStored: false,
  });
  return { ok: true, job, result };
}

export async function getReuseUseRecord(prisma, useId) {
  return getExternalResourceUse(prisma, useId);
}
