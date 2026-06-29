/**
 * Cross-turn Performer workflow memory — uploaded assets, pending intents, extracted entities.
 * Complements conversation DB + in-memory StoreCandidate stash (session-keyed).
 */

import {
  buildDocumentExtractionArtifact,
  peekPendingDocumentExtraction,
  stashPendingDocumentExtraction,
} from './storeCandidate.js';

/** @type {Map<string, Record<string, unknown>>} */
const workflowBySession = new Map();

function strip(value) {
  return String(value ?? '').trim();
}

/**
 * Stable session key for asset / workflow context when conversation DB session is absent.
 * @param {{
 *   conversationSessionId?: string | null;
 *   sessionId?: string | null;
 *   userId?: string | null;
 *   actorId?: string | null;
 *   guestSessionId?: string | null;
 * }} input
 */
export function resolveIntakeAssetSessionKey(input = {}) {
  return (
    strip(input.conversationSessionId) ||
    strip(input.sessionId) ||
    (strip(input.userId) ? `user:${strip(input.userId)}` : '') ||
    (strip(input.actorId) ? `actor:${strip(input.actorId)}` : '') ||
    (strip(input.guestSessionId) ? `guest:${strip(input.guestSessionId)}` : '') ||
    null
  );
}

/**
 * @param {string | null | undefined} sessionKey
 * @returns {Record<string, unknown> | null}
 */
export function peekIntakeWorkflowContext(sessionKey) {
  const key = strip(sessionKey);
  if (!key) return null;
  const fromMap = workflowBySession.get(key);
  if (fromMap && typeof fromMap === 'object') return { ...fromMap };

  const pending = peekPendingDocumentExtraction(key);
  if (!pending?.storeCandidate) return null;

  return {
    activeWorkflow: { type: 'store_creation', source: 'uploaded_asset', status: 'pending_confirmation' },
    uploadedAsset: {
      documentExtraction: pending,
      storeCandidate: pending.storeCandidate,
      imageDataUrl: pending.imageDataUrl ?? null,
      rawOcrText: pending.rawOcrText ?? null,
    },
    pendingIntents: ['create_store', 'from_uploaded_card'],
    entities: extractEntitiesFromStoreCandidate(pending.storeCandidate),
  };
}

/**
 * @param {import('./storeCandidate.js').StoreCandidate | null | undefined} candidate
 */
export function extractEntitiesFromStoreCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return {};
  const fields = candidate.extractedFields ?? {};
  const pick = (key) => fields[key]?.value ?? candidate[key] ?? undefined;
  return {
    ...(pick('businessName') ? { storeName: pick('businessName'), businessName: pick('businessName') } : {}),
    ...(pick('category') ? { category: pick('category') } : {}),
    ...(pick('phone') ? { phone: pick('phone') } : {}),
    ...(pick('email') ? { email: pick('email') } : {}),
    ...(pick('website') ? { website: pick('website') } : {}),
    ...(pick('address') ? { location: pick('address'), address: pick('address') } : {}),
  };
}

/**
 * @param {string | null | undefined} sessionKey
 * @param {Record<string, unknown>} patch
 */
export function stashIntakeWorkflowContext(sessionKey, patch = {}) {
  const key = strip(sessionKey);
  if (!key || !patch || typeof patch !== 'object') return null;

  const prior = workflowBySession.get(key) ?? {};
  const merged = {
    ...prior,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  workflowBySession.set(key, merged);
  return merged;
}

/**
 * Persist document extraction into workflow + StoreCandidate session stash.
 * @param {string | null | undefined} sessionKey
 * @param {import('./storeCandidate.js').DocumentExtractionArtifact} artifact
 */
export function persistUploadedAssetWorkflow(sessionKey, artifact) {
  const key = strip(sessionKey);
  if (!key || !artifact?.storeCandidate) return null;

  stashPendingDocumentExtraction(key, artifact);
  return stashIntakeWorkflowContext(key, {
    activeWorkflow: { type: 'store_creation', source: 'uploaded_asset', status: 'pending_confirmation' },
    uploadedAsset: {
      documentExtraction: artifact,
      storeCandidate: artifact.storeCandidate,
      imageDataUrl: artifact.imageDataUrl ?? null,
      rawOcrText: artifact.rawOcrText ?? null,
    },
    pendingIntents: ['create_store', 'from_uploaded_card'],
    entities: extractEntitiesFromStoreCandidate(artifact.storeCandidate),
  });
}

/**
 * Merge workflow memory into intake intentSourceContext (no re-OCR).
 * @param {Record<string, unknown> | null | undefined} intentSourceContext
 * @param {Record<string, unknown> | null | undefined} workflowContext
 * @param {string | null | undefined} sessionKey
 */
export function hydrateIntentSourceFromWorkflow(intentSourceContext, workflowContext, sessionKey) {
  const workflow =
    (workflowContext && typeof workflowContext === 'object' ? workflowContext : null) ??
    peekIntakeWorkflowContext(sessionKey);

  const base =
    intentSourceContext && typeof intentSourceContext === 'object' && !Array.isArray(intentSourceContext)
      ? { ...intentSourceContext }
      : {};

  if (!workflow) return Object.keys(base).length ? base : null;

  const uploaded = workflow.uploadedAsset && typeof workflow.uploadedAsset === 'object' ? workflow.uploadedAsset : {};
  const docExt = uploaded.documentExtraction ?? workflow.documentExtraction ?? null;
  const storeCandidate = uploaded.storeCandidate ?? docExt?.storeCandidate ?? workflow.storeCandidate ?? null;

  if (storeCandidate) {
    base.storeCandidate = storeCandidate;
    if (!base.documentExtraction && docExt) base.documentExtraction = docExt;
    // Do not set assetAction here — upload-only turns must reach the ask step first.
    if (!base.uploadedAssetPending) base.uploadedAssetPending = true;
  }
  if (uploaded.imageDataUrl && !base.pendingImageDataUrl) {
    base.pendingImageDataUrl = uploaded.imageDataUrl;
  }
  if (Array.isArray(workflow.pendingIntents) && workflow.pendingIntents.length) {
    base.pendingIntents = workflow.pendingIntents;
  }
  if (workflow.entities && typeof workflow.entities === 'object') {
    base.workflowEntities = workflow.entities;
  }
  if (workflow.activeWorkflow) {
    base.activeWorkflow = workflow.activeWorkflow;
  }

  return Object.keys(base).length ? base : null;
}

/**
 * Build workflow patch from intake response payloads (store creation / ingest).
 * @param {Record<string, unknown>} payload
 */
export function workflowPatchFromIntakePayload(payload = {}) {
  const storeCandidate = payload.storeCandidate ?? payload.documentExtraction?.storeCandidate ?? null;
  const documentExtraction =
    payload.documentExtraction ??
    (storeCandidate ? buildDocumentExtractionArtifact(storeCandidate, {}) : null);

  if (!storeCandidate && !documentExtraction) return null;

  const artifact =
    documentExtraction && typeof documentExtraction === 'object'
      ? documentExtraction
      : storeCandidate
        ? buildDocumentExtractionArtifact(storeCandidate, {})
        : null;

  if (!artifact?.storeCandidate) return null;

  return {
    activeWorkflow: { type: 'store_creation', source: 'uploaded_asset', status: 'pending_confirmation' },
    uploadedAsset: {
      documentExtraction: artifact,
      storeCandidate: artifact.storeCandidate,
      imageDataUrl: artifact.imageDataUrl ?? payload.imageDataUrl ?? null,
      rawOcrText: artifact.rawOcrText ?? null,
    },
    pendingIntents: ['create_store', 'from_uploaded_card'],
    entities: extractEntitiesFromStoreCandidate(artifact.storeCandidate),
  };
}

/** Test-only */
export function clearIntakeWorkflowContextForTests() {
  workflowBySession.clear();
}
