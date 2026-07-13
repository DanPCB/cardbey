/**
 * Intake attachment binding — hasAttachment resolution and frozen evidence for missions.
 */

import { ATTACHMENT_ANALYZER_VERSION } from './attachmentAnalysisCache.js';
import {
  getCachedAnalysisForImageRef,
  registerAttachmentIngestion,
} from './attachmentEvidenceRegistry.js';
import {
  getIntakeEvidenceBundleByEvidenceId,
  getIntakeEvidenceBundleByStream,
} from '../kernel/ingress/evidenceStore.js';
import { peekIntakeWorkflowContext } from './intakeWorkflowContext.js';
import { loadPersistedAssetIngestFromMissionMetadata } from './attachmentOcrPersistence.js';
import { hasAuthoritativeLoyaltyTopology } from '../loyalty/loyaltyContractDiagnostics.js';
import {
  loyaltyTopologyNeedsOcrReconcile,
  tryReconcileLoyaltyFromOcr,
} from '../loyalty/loyaltyTopologyOcrReconcile.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {Record<string, unknown> | null | undefined} body
 */
export function resolveIntakeHasAttachment(body) {
  if (!body || typeof body !== 'object') return false;
  const ctx =
    body.intentSourceContext && typeof body.intentSourceContext === 'object'
      ? body.intentSourceContext
      : {};
  return Boolean(
    pickString(body.attachmentId, body.evidenceId, ctx.attachmentId, ctx.evidenceId, ctx.assetRef) ||
      (Array.isArray(body.attachments) && body.attachments.length > 0) ||
      (typeof body.imageDataUrl === 'string' && body.imageDataUrl.length > 50),
  );
}

/**
 * @param {string | null | undefined} userMessage
 */
export function userReferencesUploadedCard(userMessage) {
  return /\b(this card|from this card|uploaded card|this loyalty card)\b/i.test(
    String(userMessage ?? ''),
  );
}

/**
 * @param {{
 *   userMessage?: string | null;
 *   body?: Record<string, unknown> | null;
 *   attachmentAnalysis?: Record<string, unknown> | null;
 *   intakeEvidenceBundle?: { evidenceView?: { evidenceId?: string } } | null;
 * }} input
 */
/**
 * Rehydrate loyalty card evidence on text-only follow-ups ("from this card") after an earlier upload turn.
 *
 * @param {{
 *   userMessage?: string | null;
 *   body?: Record<string, unknown> | null;
 *   intakeAssetSessionKey?: string | null;
 *   intakeEvidenceBundle?: { evidenceView?: { evidenceId?: string } } | null;
 *   attachmentAnalysis?: Record<string, unknown> | null;
 * }} input
 */
export function hydrateLoyaltyAttachmentEvidenceForFollowUp(input = {}) {
  const userMessage = input.userMessage ?? '';
  if (!userReferencesUploadedCard(userMessage)) {
    return {
      intakeEvidenceBundle: input.intakeEvidenceBundle ?? null,
      attachmentAnalysis: input.attachmentAnalysis ?? null,
    };
  }

  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const ctx =
    body.intentSourceContext && typeof body.intentSourceContext === 'object'
      ? body.intentSourceContext
      : {};

  let intakeEvidenceBundle = input.intakeEvidenceBundle ?? null;
  let attachmentAnalysis = input.attachmentAnalysis ?? null;

  if (!intakeEvidenceBundle) {
    const evidenceId = pickString(
      body.evidenceId,
      body.intakeEvidenceId,
      ctx.evidenceId,
    );
    if (evidenceId) {
      intakeEvidenceBundle =
        getIntakeEvidenceBundleByEvidenceId(evidenceId) ?? intakeEvidenceBundle;
    }
  }

  if (!attachmentAnalysis && intakeEvidenceBundle?.imageRef) {
    const cached = getCachedAnalysisForImageRef(intakeEvidenceBundle.imageRef);
    if (cached?.attachmentAnalysis && typeof cached.attachmentAnalysis === 'object') {
      attachmentAnalysis = cached.attachmentAnalysis;
    }
  }

  if (!intakeEvidenceBundle && input.intakeAssetSessionKey) {
    const sessionKey = String(input.intakeAssetSessionKey).trim();
    if (sessionKey) {
      intakeEvidenceBundle =
        getIntakeEvidenceBundleByStream(`reality:session:${sessionKey}`) ?? intakeEvidenceBundle;
    }
  }

  if (!attachmentAnalysis && intakeEvidenceBundle?.imageRef) {
    const cached = getCachedAnalysisForImageRef(intakeEvidenceBundle.imageRef);
    if (cached?.attachmentAnalysis && typeof cached.attachmentAnalysis === 'object') {
      attachmentAnalysis = cached.attachmentAnalysis;
    }
  }

  if (!attachmentAnalysis) {
    const imageRef = pickString(
      body.imageDataUrl,
      ctx.pendingImageDataUrl,
      ctx.imageDataUrl,
    );
    if (imageRef) {
      const cached = getCachedAnalysisForImageRef(imageRef);
      if (cached?.attachmentAnalysis && typeof cached.attachmentAnalysis === 'object') {
        attachmentAnalysis = cached.attachmentAnalysis;
      }
      if (!intakeEvidenceBundle && cached?.evidenceId) {
        intakeEvidenceBundle =
          getIntakeEvidenceBundleByEvidenceId(String(cached.evidenceId)) ?? intakeEvidenceBundle;
      }
    }
  }

  if (!attachmentAnalysis || !intakeEvidenceBundle) {
    const workflow = input.intakeAssetSessionKey
      ? peekIntakeWorkflowContext(input.intakeAssetSessionKey)
      : null;
    const uploaded =
      workflow?.uploadedAsset && typeof workflow.uploadedAsset === 'object'
        ? workflow.uploadedAsset
        : null;
    if (uploaded) {
      if (
        !attachmentAnalysis &&
        uploaded.attachmentAnalysis &&
        typeof uploaded.attachmentAnalysis === 'object'
      ) {
        attachmentAnalysis = uploaded.attachmentAnalysis;
      }
      const workflowEvidenceId = pickString(uploaded.intakeEvidenceId, uploaded.evidenceId);
      if (!intakeEvidenceBundle && workflowEvidenceId) {
        intakeEvidenceBundle =
          getIntakeEvidenceBundleByEvidenceId(workflowEvidenceId) ?? intakeEvidenceBundle;
      }
      if (!attachmentAnalysis) {
        const workflowImageRef = pickString(uploaded.imageDataUrl);
        if (workflowImageRef) {
          const cached = getCachedAnalysisForImageRef(workflowImageRef);
          if (cached?.attachmentAnalysis && typeof cached.attachmentAnalysis === 'object') {
            attachmentAnalysis = cached.attachmentAnalysis;
          }
        }
      }
    }
  }

  if (!attachmentAnalysis) {
    const fromBody =
      body.__earlyAttachmentAnalysis ??
      ctx.attachmentAnalysis ??
      null;
    if (fromBody && typeof fromBody === 'object' && !Array.isArray(fromBody)) {
      attachmentAnalysis = fromBody;
    }
  }

  return { intakeEvidenceBundle, attachmentAnalysis };
}

/**
 * Merge cached intake evidence onto attachment analysis (topology + OCR preserved).
 *
 * @param {Record<string, unknown> | null | undefined} attachmentAnalysis
 * @param {{
 *   evidenceId?: string | null;
 *   imageRef?: string | null;
 *   attachmentId?: string | null;
 * }} [hints]
 */
function resolveLoyaltyOcrTextForHydration(analysis, hints = {}) {
  const evidenceId = pickString(
    hints.evidenceId,
    analysis?.evidenceId,
    analysis?.preseededDraft?.evidenceId,
  );
  const bundle = evidenceId ? getIntakeEvidenceBundleByEvidenceId(evidenceId) : null;
  return pickString(
    analysis?.ocrText,
    analysis?.preseededDraft?.ocrText,
    bundle?.snapshot?.ocrText,
    hints.ocrText,
  );
}

export function hydrateAttachmentAnalysisFromIntakeEvidence(attachmentAnalysis, hints = {}) {
  let analysis =
    attachmentAnalysis && typeof attachmentAnalysis === 'object' && !Array.isArray(attachmentAnalysis)
      ? { ...attachmentAnalysis }
      : null;

  const evidenceId = pickString(
    hints.evidenceId,
    analysis?.evidenceId,
    analysis?.preseededDraft?.evidenceId,
  );
  let imageRef = pickString(
    hints.imageRef,
    analysis?.imageUrl,
    analysis?.imageDataUrl,
    analysis?.preseededDraft?.imageAssetId,
  );

  if (evidenceId) {
    const bundle = getIntakeEvidenceBundleByEvidenceId(evidenceId);
    imageRef = pickString(imageRef, bundle?.imageRef);
  }

  const hydrationOcrText = resolveLoyaltyOcrTextForHydration(analysis, { ...hints, evidenceId });

  if (imageRef) {
    const cached = getCachedAnalysisForImageRef(imageRef);
    const cachedAnalysis =
      cached?.attachmentAnalysis && typeof cached.attachmentAnalysis === 'object'
        ? cached.attachmentAnalysis
        : null;
    if (cachedAnalysis) {
      const cachedPreseed =
        cachedAnalysis.preseededDraft && typeof cachedAnalysis.preseededDraft === 'object'
          ? cachedAnalysis.preseededDraft
          : null;
      const basePreseed =
        analysis?.preseededDraft && typeof analysis.preseededDraft === 'object'
          ? analysis.preseededDraft
          : {};
      const cachedTopology = cachedPreseed?.cardTopology ?? null;
      const baseTopology = basePreseed?.cardTopology ?? null;
      const preferCachedTopology =
        hasAuthoritativeLoyaltyTopology(cachedTopology) &&
        !loyaltyTopologyNeedsOcrReconcile(cachedTopology, hydrationOcrText);
      const preferBaseTopology =
        !preferCachedTopology &&
        hasAuthoritativeLoyaltyTopology(baseTopology) &&
        !loyaltyTopologyNeedsOcrReconcile(baseTopology, hydrationOcrText);
      const mergedPreseed = {
        ...(cachedPreseed ? { ...cachedPreseed, cardTopology: undefined } : {}),
        ...(basePreseed ? { ...basePreseed, cardTopology: undefined } : {}),
        ...(preferCachedTopology
          ? { cardTopology: cachedTopology }
          : preferBaseTopology
            ? { cardTopology: baseTopology }
            : {}),
      };
      analysis = {
        ...cachedAnalysis,
        ...(analysis ?? {}),
        preseededDraft: Object.keys(mergedPreseed).length ? mergedPreseed : undefined,
        ocrText: pickString(analysis?.ocrText, cachedAnalysis.ocrText, hydrationOcrText),
        evidenceId: pickString(evidenceId, analysis?.evidenceId, cachedAnalysis.evidenceId),
        attachmentId: pickString(
          hints.attachmentId,
          analysis?.attachmentId,
          cachedAnalysis.attachmentId,
        ),
      };
    }
  }

  if (imageRef) {
    if (!analysis) analysis = { artifactType: 'loyalty_card' };
    if (!analysis.imageUrl && !analysis.imageDataUrl) {
      if (imageRef.startsWith('data:')) analysis.imageDataUrl = imageRef;
      else analysis.imageUrl = imageRef;
    }
    if (analysis.preseededDraft && typeof analysis.preseededDraft === 'object') {
      analysis.preseededDraft = {
        ...analysis.preseededDraft,
        imageAssetId:
          pickString(analysis.preseededDraft.imageAssetId, imageRef) ?? imageRef,
      };
    }
  }

  return analysis;
}

/**
 * Resolve loyalty card image ref from mission metadata, frozen bundles, and workflow memory.
 *
 * @param {Record<string, unknown>} [meta]
 * @param {{
 *   evidenceId?: string | null;
 *   streamId?: string | null;
 *   sessionId?: string | null;
 *   imageRef?: string | null;
 * }} [hints]
 */
export function resolveLoyaltyMissionImageRef(meta = {}, hints = {}) {
  const evidenceId = pickString(
    hints.evidenceId,
    meta.evidenceId,
    meta.intakeEvidence?.evidenceId,
    meta.attachmentAnalysis?.evidenceId,
    meta.attachmentAnalysis?.preseededDraft?.evidenceId,
    meta.preseededDraft?.evidenceId,
    meta.executionDraft?.evidenceId,
  );
  const streamId = pickString(
    hints.streamId,
    meta.intakeEvidence?.streamId,
    meta.attachmentAnalysis?.streamId,
  );
  const sessionId = pickString(
    hints.sessionId,
    meta.sessionId,
    meta.conversationSessionId,
    meta.intakeEvidence?.sessionId,
  );

  let imageRef = pickString(
    hints.imageRef,
    meta.imageRef,
    meta.intakeEvidence?.imageRef,
    meta.attachmentAnalysis?.imageUrl,
    meta.attachmentAnalysis?.imageDataUrl,
    meta.attachmentAnalysis?.preseededDraft?.imageAssetId,
    meta.preseededDraft?.imageAssetId,
    meta.executionDraft?.imageAssetId,
    meta.pendingAttachmentOcr?.imageDataUrl,
  );

  if (!imageRef && evidenceId) {
    imageRef = pickString(getIntakeEvidenceBundleByEvidenceId(evidenceId)?.imageRef);
  }
  if (!imageRef && streamId) {
    imageRef = pickString(getIntakeEvidenceBundleByStream(streamId)?.imageRef);
  }
  if (!imageRef && sessionId) {
    imageRef = pickString(getIntakeEvidenceBundleByStream(`reality:session:${sessionId}`)?.imageRef);
    if (!imageRef) {
      const workflow = peekIntakeWorkflowContext(sessionId);
      imageRef = pickString(workflow?.uploadedAsset?.imageDataUrl);
    }
  }

  if (!imageRef) {
    const ingest = loadPersistedAssetIngestFromMissionMetadata(meta);
    imageRef = pickString(ingest?.imageDataUrl);
  }

  return { imageRef, evidenceId, streamId, sessionId };
}

/**
 * Hydrate cached upload evidence and re-run vision/CV extraction when topology is still missing.
 *
 * @param {Record<string, unknown> | null | undefined} attachmentAnalysis
 * @param {{
 *   evidenceId?: string | null;
 *   imageRef?: string | null;
 *   attachmentId?: string | null;
 *   missionId?: string | null;
 *   storeId?: string | null;
 *   sessionId?: string | null;
 *   streamId?: string | null;
 *   missionMetadata?: Record<string, unknown> | null;
 * }} [hints]
 */
export async function ensureLoyaltyAttachmentAnalysisWithTopology(attachmentAnalysis, hints = {}) {
  const hydrated = hydrateAttachmentAnalysisFromIntakeEvidence(attachmentAnalysis, hints);
  const ocrText = resolveLoyaltyOcrTextForHydration(hydrated, hints);
  const topology = hydrated?.preseededDraft?.cardTopology ?? hydrated?.cardTopology ?? null;

  if (loyaltyTopologyNeedsOcrReconcile(topology, ocrText)) {
    const reconciled = tryReconcileLoyaltyFromOcr(
      ocrText,
      hydrated?.preseededDraft && typeof hydrated.preseededDraft === 'object'
        ? hydrated.preseededDraft
        : {},
    );
    if (reconciled?.preseededDraft) {
      return {
        ...(hydrated ?? { artifactType: 'loyalty_card' }),
        artifactType: 'loyalty_card',
        ocrText,
        confidence: Math.max(
          Number(hydrated?.confidence) || 0,
          Number(reconciled.preseededDraft.confidence) || 0.9,
        ),
        preseededDraft: reconciled.preseededDraft,
      };
    }
  }

  if (hasAuthoritativeLoyaltyTopology(topology)) {
    return hydrated;
  }

  const missionMeta =
    hints.missionMetadata && typeof hints.missionMetadata === 'object' ? hints.missionMetadata : {};
  const resolved = resolveLoyaltyMissionImageRef(missionMeta, hints);
  const imageUrl = pickString(
    resolved.imageRef,
    hints.imageRef,
    hydrated?.imageUrl,
    hydrated?.imageDataUrl,
    hydrated?.preseededDraft?.imageAssetId,
  );
  if (!imageUrl) return hydrated;

  const { extractLoyaltyCardFromImage } = await import(
    '../toolExecutors/loyalty/loyaltyCardVisionExtract.js'
  );
  const extracted = await extractLoyaltyCardFromImage({
    imageUrl,
    storeId: hints.storeId ?? null,
    missionId: hints.missionId ?? null,
    evidenceId: pickString(resolved.evidenceId, hints.evidenceId, hydrated?.evidenceId) ?? null,
  });
  if (!extracted?.ok || !extracted.preseededDraft) {
    return hydrated;
  }

  const evidenceId = pickString(
    resolved.evidenceId,
    hints.evidenceId,
    hydrated?.evidenceId,
    hydrated?.preseededDraft?.evidenceId,
  );
  const preseededDraft = {
    ...(hydrated?.preseededDraft && typeof hydrated.preseededDraft === 'object'
      ? hydrated.preseededDraft
      : {}),
    ...extracted.preseededDraft,
    cardTopology:
      extracted.preseededDraft.cardTopology ??
      hydrated?.preseededDraft?.cardTopology ??
      null,
    rule: extracted.preseededDraft.rule ?? hydrated?.preseededDraft?.rule ?? null,
    evidenceId: evidenceId ?? undefined,
    storeId: pickString(hints.storeId, extracted.preseededDraft.storeId) ?? undefined,
    missionId: pickString(hints.missionId, extracted.preseededDraft.missionId) ?? undefined,
    imageAssetId: imageUrl,
    sourceMode: 'SOURCE_DRIVEN',
  };

  return {
    ...(hydrated ?? { artifactType: 'loyalty_card' }),
    artifactType: 'loyalty_card',
    ocrText: extracted.ocrText ?? hydrated?.ocrText ?? null,
    confidence: Math.max(
      Number(hydrated?.confidence) || 0,
      Number(preseededDraft.confidence) || 0,
      Number(extracted.preseededDraft.confidence) || 0,
    ),
    preseededDraft,
    evidenceId: evidenceId ?? undefined,
    imageUrl: imageUrl.startsWith('data:') ? undefined : imageUrl,
    imageDataUrl: imageUrl.startsWith('data:') ? imageUrl : hydrated?.imageDataUrl,
  };
}

export function assertLoyaltyCardEvidenceBound(input = {}) {
  if (!userReferencesUploadedCard(input.userMessage)) {
    return { ok: true };
  }

  const body = input.body ?? {};
  const ctx =
    body.intentSourceContext && typeof body.intentSourceContext === 'object'
      ? body.intentSourceContext
      : {};
  const evidenceId = pickString(
    body.evidenceId,
    ctx.evidenceId,
    input.intakeEvidenceBundle?.evidenceView?.evidenceId,
    input.attachmentAnalysis?.evidenceId,
    input.attachmentAnalysis?.preseededDraft?.evidenceId,
  );
  const attachmentId = pickString(
    body.attachmentId,
    ctx.attachmentId,
    input.attachmentAnalysis?.attachmentId,
    input.attachmentAnalysis?.preseededDraft?.attachmentId,
  );
  const hasTopology = Boolean(
    input.attachmentAnalysis?.preseededDraft?.cardTopology ??
      input.attachmentAnalysis?.cardTopology,
  );

  if (!evidenceId && !attachmentId && !hasTopology) {
    return {
      ok: false,
      code: 'ATTACHMENT_EVIDENCE_NOT_BOUND',
      message:
        'The uploaded card was analysed, but evidence was not bound to this loyalty request. Retry with the attachment attached.',
    };
  }

  return { ok: true, evidenceId: evidenceId || undefined, attachmentId: attachmentId || undefined };
}

/**
 * Freeze one evidence bundle onto preseeded draft / mission contract fields.
 *
 * @param {Record<string, unknown> | null | undefined} preseeded
 * @param {{
 *   evidenceId?: string | null;
 *   attachmentId?: string | null;
 *   contentHash?: string | null;
 *   storeId?: string | null;
 *   missionId?: string | null;
 *   imageRef?: string | null;
 * }} ctx
 */
export function bindFrozenEvidenceToPreseeded(preseeded, ctx = {}) {
  const base = preseeded && typeof preseeded === 'object' ? { ...preseeded } : {};
  const ingestion = ctx.attachmentId
    ? null
    : registerAttachmentIngestion({
        imageRef: ctx.imageRef ?? null,
        storeId: ctx.storeId ?? null,
      });

  const frozen = {
    ...base,
    evidenceId: pickString(ctx.evidenceId, base.evidenceId) || undefined,
    attachmentId:
      pickString(ctx.attachmentId, ingestion?.attachmentId, base.attachmentId) || undefined,
    contentHash:
      pickString(ctx.contentHash, ingestion?.contentHash, base.contentHash) || undefined,
    analyzerVersion: ATTACHMENT_ANALYZER_VERSION,
    storeId: pickString(ctx.storeId, base.storeId) || undefined,
    missionId: pickString(ctx.missionId, base.missionId) || undefined,
    sourceMode: 'SOURCE_DRIVEN',
    frozenEvidenceAt: new Date().toISOString(),
  };

  if (frozen.cardTopology || frozen.extractedFromImage || frozen.rule) {
    frozen.sourceMode = 'SOURCE_DRIVEN';
  }

  return Object.freeze(frozen);
}

/**
 * @param {Record<string, unknown>} missionMetadata
 * @param {Record<string, unknown>} frozenEvidence
 */
export function bindFrozenEvidenceToMissionMetadata(missionMetadata, frozenEvidence) {
  const meta = missionMetadata && typeof missionMetadata === 'object' ? { ...missionMetadata } : {};
  return {
    ...meta,
    frozenEvidence: Object.freeze({ ...frozenEvidence }),
    evidenceId: frozenEvidence.evidenceId ?? meta.evidenceId ?? null,
    attachmentId: frozenEvidence.attachmentId ?? meta.attachmentId ?? null,
    contentHash: frozenEvidence.contentHash ?? meta.contentHash ?? null,
    sourceMode: frozenEvidence.sourceMode ?? meta.sourceMode ?? 'SOURCE_DRIVEN',
    preseededDraft: bindFrozenEvidenceToPreseeded(meta.preseededDraft ?? {}, frozenEvidence),
  };
}

export default {
  resolveIntakeHasAttachment,
  userReferencesUploadedCard,
  hydrateLoyaltyAttachmentEvidenceForFollowUp,
  hydrateAttachmentAnalysisFromIntakeEvidence,
  resolveLoyaltyMissionImageRef,
  ensureLoyaltyAttachmentAnalysisWithTopology,
  assertLoyaltyCardEvidenceBound,
  bindFrozenEvidenceToPreseeded,
  bindFrozenEvidenceToMissionMetadata,
};
