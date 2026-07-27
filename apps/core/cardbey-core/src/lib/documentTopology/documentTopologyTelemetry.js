/**
 * Document topology observability — no OCR text in payloads.
 */

import { emitLoyaltyTopologyTelemetry } from '../loyalty/loyaltyTopologyTelemetry.js';

/**
 * @param {string} eventType
 * @param {Record<string, unknown>} [payload]
 */
export function emitDocumentTopologyTelemetry(eventType, payload = {}) {
  const sanitized = { ...payload };
  delete sanitized.ocrText;
  delete sanitized.text;
  delete sanitized.cells;
  for (const key of Object.keys(sanitized)) {
    if (/ocr|rawText|label/i.test(key) && typeof sanitized[key] === 'string') {
      delete sanitized[key];
    }
  }

  const entry = {
    event: eventType,
    at: new Date().toISOString(),
    ...sanitized,
  };

  if (process.env.NODE_ENV !== 'production') {
    console.log('[DocumentTopology]', JSON.stringify(entry));
  }

  // Bridge legacy loyalty topology listeners during migration.
  if (eventType.startsWith('document_topology_')) {
    const legacy = eventType.replace('document_topology_', 'loyalty_topology_');
    emitLoyaltyTopologyTelemetry(legacy, sanitized);
  }

  return entry;
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology | null | undefined} topology
 * @param {Record<string, unknown>} [ctx]
 */
export function emitDocumentTopologyDetected(topology, ctx = {}) {
  if (!topology) return null;
  return emitDocumentTopologyTelemetry('document_topology_detected', {
    rows: topology.rows,
    columns: topology.columns,
    documentType: topology.documentType,
    confidence: topology.confidence,
    ownerModified: topology.source === 'OWNER_DEFINED',
    source: topology.source,
    ...ctx,
  });
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology | null | undefined} topology
 * @param {Record<string, unknown>} [ctx]
 */
export function emitDocumentTopologyReviewed(topology, ctx = {}) {
  return emitDocumentTopologyTelemetry('document_topology_reviewed', {
    rows: topology?.rows,
    columns: topology?.columns,
    documentType: topology?.documentType,
    confidence: topology?.confidence,
    ownerModified: topology?.source === 'OWNER_DEFINED',
    source: topology?.source,
    ...ctx,
  });
}

export function emitDocumentTopologyEdited(topology, ctx = {}) {
  return emitDocumentTopologyTelemetry('document_topology_edited', {
    rows: topology?.rows,
    columns: topology?.columns,
    documentType: topology?.documentType,
    confidence: topology?.confidence,
    ownerModified: true,
    source: 'OWNER_DEFINED',
    ...ctx,
  });
}

export function emitDocumentTopologyApproved(topology, ctx = {}) {
  return emitDocumentTopologyTelemetry('document_topology_approved', {
    rows: topology?.rows,
    columns: topology?.columns,
    documentType: topology?.documentType,
    confidence: topology?.confidence,
    ownerModified: topology?.source === 'OWNER_DEFINED',
    source: topology?.source ?? 'APPROVED',
    ...ctx,
  });
}

export function emitDocumentTopologyRejected(topology, ctx = {}) {
  return emitDocumentTopologyTelemetry('document_topology_rejected', {
    rows: topology?.rows,
    columns: topology?.columns,
    documentType: topology?.documentType,
    confidence: topology?.confidence,
    source: topology?.source,
    ...ctx,
  });
}

export function emitDocumentTopologyPublished(topology, ctx = {}) {
  return emitDocumentTopologyTelemetry('document_topology_published', {
    rows: topology?.rows,
    columns: topology?.columns,
    documentType: topology?.documentType,
    confidence: topology?.confidence,
    ownerModified: topology?.source === 'OWNER_DEFINED',
    source: topology?.source ?? 'PUBLISHED',
    ...ctx,
  });
}

export default {
  emitDocumentTopologyTelemetry,
  emitDocumentTopologyDetected,
  emitDocumentTopologyReviewed,
  emitDocumentTopologyEdited,
  emitDocumentTopologyApproved,
  emitDocumentTopologyRejected,
  emitDocumentTopologyPublished,
};
