/**
 * Phase 10 — Mirror uploads/scans into suitcase vault.
 */
import { createSuitcaseItem } from './suitcaseItemService.js';

function contentTypeFromMime(mime) {
  const m = String(mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('json')) return 'json';
  if (m.startsWith('text/')) return 'text';
  return 'mixed';
}

/**
 * @param {object} input
 */
export async function saveUploadToSuitcase(input, prisma) {
  const ownerId = String(input.ownerId ?? '').trim();
  if (!ownerId) return { skipped: true, reason: 'no_owner' };

  const sourceType = input.scanSource ? 'scan' : 'upload';
  const fileUrl = String(input.fileUrl ?? input.documentUrl ?? '').trim();
  const originalFilename = String(input.originalFilename ?? input.filename ?? '').trim();
  const title =
    String(input.title ?? '').trim() ||
    originalFilename ||
    (sourceType === 'scan' ? 'Scanned document' : 'Uploaded document');

  const mime = String(input.mimeType ?? input.mime ?? '').trim();
  const contentType = contentTypeFromMime(mime);

  const idempotencyKey =
    input.idempotencyKey ||
    (fileUrl ? `${sourceType}:${ownerId}:${fileUrl}` : null);

  const result = await createSuitcaseItem(
    {
      ownerId,
      storeId: input.storeId ? String(input.storeId).trim() : null,
      spaceId: input.spaceId ? String(input.spaceId).trim() : null,
      missionId: input.missionId ? String(input.missionId).trim() : null,
      sourceType,
      contentType,
      title,
      summary: input.summary ? String(input.summary) : null,
      fileUrl: fileUrl || null,
      thumbnailUrl: input.thumbnailUrl ? String(input.thumbnailUrl) : null,
      payload: input.extractedData ?? input.payload ?? null,
      tags: [sourceType, 'document'],
      metadata: {
        originalFilename: originalFilename || null,
        detectedType: mime || null,
        scanSource: input.scanSource ?? null,
        extractedEntities: input.extractedEntities ?? null,
        generatedBy: 'document_ingest',
        version: 'phase_10',
      },
      idempotencyKey,
    },
    prisma,
  );

  return { skipped: Boolean(result.skipped), item: result.item ?? null, created: result.created };
}
