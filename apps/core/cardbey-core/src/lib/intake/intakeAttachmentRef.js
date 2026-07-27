/**
 * Canonical attachment reference contract for intake replay turns.
 */

import { stripHeavyUploadFieldsDeep } from './intakeReplayPayload.js';

/**
 * @param {unknown} body
 * @returns {{ attachmentId: string | null; assetRef: string | null; mediaType: string | null; evidenceId: string | null }}
 */
export function buildCanonicalAttachmentRef(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const evidenceId = String(
    b.evidenceId ?? b.intakeEvidenceId ?? b.intentSourceContext?.evidenceId ?? '',
  ).trim() || null;
  const attachmentId = String(
    b.attachmentId ?? b.intentSourceContext?.attachmentId ?? b.attachments?.[0]?.attachmentId ?? '',
  ).trim() || null;
  const assetRef = String(
    b.assetRef ??
      b.fileAssetId ??
      b.attachments?.[0]?.fileAssetId ??
      b.attachments?.[0]?.uploadId ??
      '',
  ).trim() || null;
  const mediaType = String(
    b.mediaType ?? b.attachments?.[0]?.mimeType ?? b.attachments?.[0]?.mime ?? '',
  ).trim() || null;
  return { attachmentId, assetRef, mediaType, evidenceId };
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {number}
 */
function countEmbeddedImageRefs(value, depth = 0) {
  if (depth > 8 || value == null) return 0;
  if (typeof value === 'string') {
    const s = value.trim();
    return s.startsWith('data:image/') && s.length > 200 ? 1 : 0;
  }
  if (typeof value !== 'object') return 0;
  let count = 0;
  if (Array.isArray(value)) {
    for (const entry of value) count += countEmbeddedImageRefs(entry, depth + 1);
    return count;
  }
  for (const [key, child] of Object.entries(value)) {
    if (['imageDataUrl', 'pendingImageDataUrl', 'dataUrl', 'previewDataUrl', 'base64'].includes(key)) {
      if (typeof child === 'string' && child.trim().length > 200) count += 1;
      continue;
    }
    count += countEmbeddedImageRefs(child, depth + 1);
  }
  return count;
}

/**
 * One request may contain either first-ingestion imageDataUrl OR evidence/attachment refs — never both.
 * @param {unknown} body
 * @param {{ devMode?: boolean }} [opts]
 */
export function validateIntakeAttachmentPayload(body, opts = {}) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const ref = buildCanonicalAttachmentRef(b);
  const hasImageDataUrl =
    typeof b.imageDataUrl === 'string' && b.imageDataUrl.trim().length > 50;
  const hasEvidenceRef = Boolean(ref.evidenceId || ref.attachmentId || ref.assetRef);
  const embeddedCopies = countEmbeddedImageRefs(b);

  if (hasImageDataUrl && hasEvidenceRef) {
    return {
      ok: false,
      error: 'duplicate_attachment_payload',
      message: 'Send imageDataUrl for first upload only; subsequent turns must use evidenceId/attachmentId.',
      canonicalRef: ref,
    };
  }

  const devMode =
    opts.devMode ??
    (process.env.NODE_ENV !== 'production' && process.env.VITEST !== 'true');
  if (devMode && embeddedCopies > 1) {
    return {
      ok: false,
      error: 'duplicate_embedded_image',
      message: `Intake payload embeds ${embeddedCopies} image copies; use a single canonical attachment reference.`,
      canonicalRef: ref,
      embeddedCopies,
    };
  }

  return { ok: true, canonicalRef: ref, embeddedCopies };
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ evidenceId?: string | null; attachmentId?: string | null; assetRef?: string | null; mediaType?: string | null }} ref
 */
export function applyCanonicalAttachmentRefToBody(body, ref) {
  if (!body || typeof body !== 'object') return body;
  const slimmed = stripHeavyUploadFieldsDeep(body);
  const out = slimmed && typeof slimmed === 'object' && !Array.isArray(slimmed) ? { ...slmed } : { ...body };
  delete out.imageDataUrl;
  delete out.pendingImageDataUrl;
  if (ref.evidenceId) out.evidenceId = ref.evidenceId;
  if (ref.attachmentId) out.attachmentId = ref.attachmentId;
  if (ref.assetRef) out.assetRef = ref.assetRef;
  if (ref.mediaType) out.mediaType = ref.mediaType;
  if (out.intentSourceContext && typeof out.intentSourceContext === 'object') {
    out.intentSourceContext = stripHeavyUploadFieldsDeep(out.intentSourceContext);
  }
  if (out.currentContext && typeof out.currentContext === 'object') {
    out.currentContext = stripHeavyUploadFieldsDeep(out.currentContext);
  }
  if (Array.isArray(out.history)) {
    out.history = out.history.map((turn) =>
      turn && typeof turn === 'object' ? stripHeavyUploadFieldsDeep(turn) : turn,
    );
  }
  return out;
}
