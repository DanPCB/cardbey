/**
 * Resource Index — metadata, provenance, rights snapshot, availability.
 * Does NOT store binaries.
 */

import { createHash } from 'node:crypto';

/** @type {Map<string, object>} */
const index = new Map();

export function fingerprintResource(parts = {}) {
  const raw = [
    parts.sourceId || '',
    parts.remoteId || '',
    parts.canonicalUrl || '',
    parts.title || '',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Upsert an indexed resource record (metadata only).
 */
export function upsertResourceRecord(record) {
  const fingerprint =
    record.fingerprint ||
    fingerprintResource({
      sourceId: record.sourceId,
      remoteId: record.remoteId,
      canonicalUrl: record.canonicalUrl,
      title: record.title,
    });
  const id = record.id || `res_${fingerprint}`;
  const prev = index.get(id);
  const next = {
    id,
    fingerprint,
    sourceId: record.sourceId,
    remoteId: record.remoteId || null,
    canonicalUrl: record.canonicalUrl || null,
    previewUrl: record.previewUrl || null,
    title: record.title || null,
    mediaType: record.mediaType || null,
    industry: record.industry || null,
    sourceMetadata: record.sourceMetadata || prev?.sourceMetadata || {},
    aiMetadata: record.aiMetadata || prev?.aiMetadata || null,
    reviewedMetadata: record.reviewedMetadata || prev?.reviewedMetadata || null,
    provenance: record.provenance || prev?.provenance || {},
    rightsSnapshot: record.rightsSnapshot || prev?.rightsSnapshot || { status: 'UNKNOWN' },
    qualitySnapshot: record.qualitySnapshot || prev?.qualitySnapshot || {},
    availability: record.availability || prev?.availability || { available: true },
    technical: record.technical || prev?.technical || {},
    relationships: record.relationships || prev?.relationships || [],
    embeddingRef: record.embeddingRef || prev?.embeddingRef || null,
    indexedAt: prev?.indexedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    binaryStored: false,
  };
  index.set(id, next);
  return next;
}

export function getResourceRecord(id) {
  return index.get(id) || null;
}

export function listResourceIndex({ sourceId, industry, mediaType, limit = 50 } = {}) {
  let rows = [...index.values()];
  if (sourceId) rows = rows.filter((r) => r.sourceId === sourceId);
  if (industry) rows = rows.filter((r) => r.industry === industry);
  if (mediaType) rows = rows.filter((r) => r.mediaType === mediaType);
  rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return rows.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
}

export function resourceIndexStats() {
  const rows = [...index.values()];
  return {
    total: rows.length,
    bySource: rows.reduce((acc, r) => {
      acc[r.sourceId] = (acc[r.sourceId] || 0) + 1;
      return acc;
    }, {}),
    binariesStored: 0,
  };
}

/** Test helper */
export function resetResourceIndexForTests() {
  index.clear();
}
