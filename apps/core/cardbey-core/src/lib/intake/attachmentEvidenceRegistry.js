/**
 * Canonical attachment ingestion + analysis bundle registry.
 * One analysis per contentHash + analyzerVersion; later requests reuse evidenceId.
 */

import { randomUUID } from 'node:crypto';
import {
  ATTACHMENT_ANALYZER_VERSION,
  buildAttachmentCacheKey,
  getCachedAttachmentAnalysis,
  hashAttachmentContent,
  setCachedAttachmentAnalysis,
} from './attachmentAnalysisCache.js';

/** @type {Map<string, string>} */
const attachmentIdByHash = new Map();

/** @type {Map<string, Record<string, unknown>>} */
const ingestionById = new Map();

/**
 * @param {{
 *   imageRef?: string | null;
 *   assetRef?: string | null;
 *   sessionId?: string | null;
 *   storeId?: string | null;
 *   uploadedBy?: string | null;
 * }} input
 */
export function registerAttachmentIngestion(input = {}) {
  const imageRef = String(input.imageRef ?? input.assetRef ?? '').trim() || null;
  const contentHash = hashAttachmentContent(imageRef);
  if (!contentHash) return null;

  let attachmentId = attachmentIdByHash.get(contentHash);
  if (!attachmentId) {
    attachmentId = `att_${randomUUID().slice(0, 12)}`;
    attachmentIdByHash.set(contentHash, attachmentId);
    const record = {
      attachmentId,
      contentHash,
      assetRef: imageRef?.startsWith('data:') ? null : imageRef,
      uploadedBy: input.uploadedBy ?? null,
      sessionId: input.sessionId ?? null,
      storeId: input.storeId ?? null,
      createdAt: new Date().toISOString(),
    };
    ingestionById.set(attachmentId, record);
    return record;
  }

  const existing = ingestionById.get(attachmentId);
  if (existing && input.storeId && !existing.storeId) {
    existing.storeId = input.storeId;
  }
  return existing ?? null;
}

/**
 * @param {string | null | undefined} attachmentId
 */
export function getAttachmentIngestion(attachmentId) {
  const id = String(attachmentId ?? '').trim();
  return id ? ingestionById.get(id) ?? null : null;
}

/**
 * @param {{
 *   imageRef?: string | null;
 *   evidenceId?: string | null;
 *   attachmentId?: string | null;
 *   attachmentAnalysis?: Record<string, unknown> | null;
 *   analyzerVersion?: string;
 *   completedAt?: string;
 * }} input
 */
export function buildAnalysisBundleRecord(input = {}) {
  const imageRef = String(input.imageRef ?? '').trim() || null;
  const ingestion = input.attachmentId
    ? getAttachmentIngestion(input.attachmentId)
    : registerAttachmentIngestion({ imageRef, storeId: input.storeId ?? null });

  return {
    evidenceId: input.evidenceId ?? null,
    attachmentId: ingestion?.attachmentId ?? input.attachmentId ?? null,
    contentHash: ingestion?.contentHash ?? hashAttachmentContent(imageRef),
    analyzerVersion: input.analyzerVersion ?? ATTACHMENT_ANALYZER_VERSION,
    documentType: input.attachmentAnalysis?.artifactType ?? 'LOYALTY_CARD',
    ocrRef: input.attachmentAnalysis?.ocrTextRef ?? null,
    visualTopology: input.attachmentAnalysis?.preseededDraft?.cardTopology ?? null,
    semanticRule: input.attachmentAnalysis?.preseededDraft?.rule ?? null,
    confidence: Number(input.attachmentAnalysis?.confidence) || 0,
    completedAt: input.completedAt ?? new Date().toISOString(),
    cacheKey: buildAttachmentCacheKey(imageRef),
  };
}

/**
 * Stamp canonical ids onto attachment analysis + preseededDraft.
 *
 * @param {Record<string, unknown>} attachmentAnalysis
 * @param {{
 *   evidenceId?: string | null;
 *   attachmentId?: string | null;
 *   contentHash?: string | null;
 *   storeId?: string | null;
 *   missionId?: string | null;
 *   sessionId?: string | null;
 * }} ctx
 */
export function stampEvidenceOnAttachmentAnalysis(attachmentAnalysis, ctx = {}) {
  if (!attachmentAnalysis || typeof attachmentAnalysis !== 'object') return attachmentAnalysis;
  const next = { ...attachmentAnalysis };
  if (ctx.evidenceId) next.evidenceId = ctx.evidenceId;
  if (ctx.attachmentId) next.attachmentId = ctx.attachmentId;
  if (ctx.contentHash) next.contentHash = ctx.contentHash;
  if (ctx.storeId) next.storeId = ctx.storeId;
  if (ctx.missionId) next.missionId = ctx.missionId;
  next.analyzerVersion = ATTACHMENT_ANALYZER_VERSION;

  const preseeded =
    next.preseededDraft && typeof next.preseededDraft === 'object'
      ? { ...next.preseededDraft }
      : {};
  if (ctx.evidenceId) preseeded.evidenceId = ctx.evidenceId;
  if (ctx.attachmentId) preseeded.attachmentId = ctx.attachmentId;
  if (ctx.contentHash) preseeded.contentHash = ctx.contentHash;
  if (ctx.storeId) preseeded.storeId = ctx.storeId;
  if (ctx.missionId) preseeded.missionId = ctx.missionId;
  preseeded.analyzerVersion = ATTACHMENT_ANALYZER_VERSION;
  if (preseeded.extractedFromImage || preseeded.cardTopology) {
    preseeded.sourceMode = 'SOURCE_DRIVEN';
  }
  next.preseededDraft = preseeded;
  return next;
}

/**
 * @param {string | null | undefined} imageRef
 */
export function getCachedAnalysisForImageRef(imageRef) {
  const cacheKey = buildAttachmentCacheKey(imageRef);
  if (!cacheKey) return null;
  return getCachedAttachmentAnalysis(cacheKey);
}

export function cacheAnalysisForImageRef(imageRef, entry) {
  const cacheKey = buildAttachmentCacheKey(imageRef);
  if (!cacheKey || !entry) return;
  setCachedAttachmentAnalysis(cacheKey, entry);
}

export function __clearAttachmentEvidenceRegistryForTests() {
  attachmentIdByHash.clear();
  ingestionById.clear();
}

export default {
  registerAttachmentIngestion,
  getAttachmentIngestion,
  buildAnalysisBundleRecord,
  stampEvidenceOnAttachmentAnalysis,
  getCachedAnalysisForImageRef,
  cacheAnalysisForImageRef,
};
