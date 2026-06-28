/**
 * Persist attachment OCR across clarify → create_store handoffs (mission metadata).
 */

import { buildOcrHintsFromImageText } from './storeCreationDraftAssetBridge.js';
import { buildAssetEntityContext } from './assetIntentIngestService.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {{
 *   rawOcrText?: string | null;
 *   ocrHints?: Record<string, unknown> | null;
 *   imageDataUrl?: string | null;
 *   entityContext?: Record<string, unknown> | null;
 * }} payload
 */
export async function persistAttachmentOcrToMission(prisma, missionId, payload = {}) {
  const mid = String(missionId ?? '').trim();
  const rawOcrText = String(payload.rawOcrText ?? payload.ocrHints?.rawText ?? '').trim();
  if (!mid || !prisma || !rawOcrText) return false;

  try {
    const existing = await prisma.missionPipeline.findUnique({
      where: { id: mid },
      select: { metadataJson: true },
    });
    if (!existing) return false;

    const baseMeta =
      existing.metadataJson && typeof existing.metadataJson === 'object' && !Array.isArray(existing.metadataJson)
        ? { ...existing.metadataJson }
        : {};

    const ocrHints =
      payload.ocrHints && typeof payload.ocrHints === 'object'
        ? payload.ocrHints
        : buildOcrHintsFromImageText(rawOcrText);

    const entityContext =
      payload.entityContext && typeof payload.entityContext === 'object'
        ? payload.entityContext
        : buildAssetEntityContext({
            ocrHints,
            rawOcrText,
            imageDataUrl: payload.imageDataUrl ?? null,
            source: 'performer_composer',
            currentEntry: 'performer',
          });

    const priorOutputs =
      baseMeta.stepOutputs && typeof baseMeta.stepOutputs === 'object' && !Array.isArray(baseMeta.stepOutputs)
        ? baseMeta.stepOutputs
        : {};

    const ingestSnapshot = {
      ok: true,
      phase: 'awaiting_intent_selection',
      entityContext,
      rawOcrText,
      ocrHints,
      imageDataUrl: payload.imageDataUrl ?? null,
    };

    await prisma.missionPipeline.update({
      where: { id: mid },
      data: {
        metadataJson: {
          ...baseMeta,
          assetIntentContext: entityContext,
          pendingAttachmentOcr: {
            rawOcrText,
            ocrHints,
            imageDataUrl: payload.imageDataUrl ?? null,
            updatedAt: new Date().toISOString(),
          },
          stepOutputs: {
            ...priorOutputs,
            ingest_asset_for_intent_detection: ingestSnapshot,
            pending_attachment_ocr: ingestSnapshot,
          },
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} metadataJson
 * @returns {Record<string, unknown> | null}
 */
export function loadPersistedAssetIngestFromMissionMetadata(metadataJson) {
  if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) return null;

  const stepOutputs =
    metadataJson.stepOutputs && typeof metadataJson.stepOutputs === 'object' && !Array.isArray(metadataJson.stepOutputs)
      ? metadataJson.stepOutputs
      : {};

  const fromStep =
    (stepOutputs.ingest_asset_for_intent_detection &&
    typeof stepOutputs.ingest_asset_for_intent_detection === 'object'
      ? stepOutputs.ingest_asset_for_intent_detection
      : null) ??
    (stepOutputs.pending_attachment_ocr && typeof stepOutputs.pending_attachment_ocr === 'object'
      ? stepOutputs.pending_attachment_ocr
      : null);

  if (fromStep && typeof fromStep === 'object') {
    return { ...fromStep };
  }

  const pending =
    metadataJson.pendingAttachmentOcr && typeof metadataJson.pendingAttachmentOcr === 'object'
      ? metadataJson.pendingAttachmentOcr
      : null;
  const entityContext =
    metadataJson.assetIntentContext && typeof metadataJson.assetIntentContext === 'object'
      ? metadataJson.assetIntentContext
      : null;

  if (!pending && !entityContext) return null;

  const rawOcrText = String(pending?.rawOcrText ?? '').trim() || null;
  const ocrHints =
    pending?.ocrHints && typeof pending.ocrHints === 'object' ? pending.ocrHints : null;

  return {
    ok: true,
    phase: 'awaiting_intent_selection',
    entityContext: entityContext ?? null,
    rawOcrText,
    ocrHints,
    imageDataUrl: pending?.imageDataUrl ?? entityContext?.imageDataUrl ?? null,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string | null | undefined} missionId
 */
export async function loadPersistedAssetIngestFromMission(prisma, missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid || !prisma) return null;
  try {
    const row = await prisma.missionPipeline.findUnique({
      where: { id: mid },
      select: { metadataJson: true },
    });
    return loadPersistedAssetIngestFromMissionMetadata(row?.metadataJson ?? null);
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} cardExtraction
 * @returns {Record<string, unknown> | null}
 */
export function buildAssetIngestFromCardExtraction(cardExtraction) {
  if (!cardExtraction || typeof cardExtraction !== 'object' || Array.isArray(cardExtraction)) return null;
  const businessName = String(cardExtraction.businessName ?? '').trim() || null;
  const location = String(cardExtraction.location ?? '').trim() || null;
  const vertical = String(cardExtraction.vertical ?? cardExtraction.category ?? '').trim() || null;
  if (!businessName && !location && !vertical) return null;

  const ocrHints = {
    businessName,
    detectedBusinessName: businessName,
    location,
    vertical,
    businessType: vertical,
  };
  const entityContext = buildAssetEntityContext({
    ocrHints,
    source: 'performer_composer',
    currentEntry: 'performer',
  });

  return {
    ok: true,
    phase: 'awaiting_intent_selection',
    entityContext,
    ocrHints,
    rawOcrText: null,
  };
}
