/**
 * Persist document topology revision history.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../prisma.js';
import { emitDocumentTopologyApproved, emitDocumentTopologyPublished } from './documentTopologyTelemetry.js';

/**
 * @param {{
 *   documentId: string;
 *   documentType: string;
 *   topology: import('./documentTopologyTypes.js').DocumentTopology;
 *   createdBy?: string | null;
 *   source?: string;
 *   changes?: Record<string, unknown>;
 *   approved?: boolean;
 * }} input
 */
export async function recordDocumentTopologyRevision(input) {
  const prisma = getPrismaClient();
  const revisionId = randomUUID();
  const source = input.source ?? input.topology?.source ?? 'VISION_EXTRACTED';
  const confidence = Number(input.topology?.confidence) || null;

  const row = await prisma.documentTopologyRevision.create({
    data: {
      id: revisionId,
      documentId: input.documentId,
      documentType: input.documentType,
      createdBy: input.createdBy ?? null,
      source,
      topologyJson: input.topology,
      changesJson: input.changes ?? null,
      confidence,
      approved: Boolean(input.approved),
    },
  });

  if (input.approved) {
    emitDocumentTopologyApproved(input.topology, { documentId: input.documentId, revisionId });
  }

  return {
    revisionId: row.id,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
    approved: row.approved,
  };
}

/**
 * @param {string} documentId
 * @param {number} [limit]
 */
export async function listDocumentTopologyRevisions(documentId, limit = 20) {
  const prisma = getPrismaClient();
  const rows = await prisma.documentTopologyRevision.findMany({
    where: { documentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.map((row) => ({
    revisionId: row.id,
    documentId: row.documentId,
    documentType: row.documentType,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    source: row.source,
    topology: row.topologyJson,
    changes: row.changesJson,
    confidence: row.confidence,
    approved: row.approved,
  }));
}

/**
 * @param {string} revisionIdA
 * @param {string} revisionIdB
 */
export async function compareDocumentTopologyRevisions(revisionIdA, revisionIdB) {
  const prisma = getPrismaClient();
  const [a, b] = await Promise.all([
    prisma.documentTopologyRevision.findUnique({ where: { id: revisionIdA } }),
    prisma.documentTopologyRevision.findUnique({ where: { id: revisionIdB } }),
  ]);
  if (!a || !b) return { ok: false, error: 'revision_not_found' };

  const topoA = /** @type {import('./documentTopologyTypes.js').DocumentTopology} */ (a.topologyJson);
  const topoB = /** @type {import('./documentTopologyTypes.js').DocumentTopology} */ (b.topologyJson);

  return {
    ok: true,
    a: { revisionId: a.id, source: a.source, topology: topoA, confidence: a.confidence },
    b: { revisionId: b.id, source: b.source, topology: topoB, confidence: b.confidence },
    diff: {
      rowsChanged: topoA.rows !== topoB.rows,
      columnsChanged: topoA.columns !== topoB.columns,
      cellCountDelta: (topoB.cells?.length ?? 0) - (topoA.cells?.length ?? 0),
      sourceChanged: topoA.source !== topoB.source,
    },
  };
}

/**
 * @param {string} documentId
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 * @param {{ createdBy?: string; loyaltyProgramId?: string }} [ctx]
 */
export async function recordPublishedTopology(documentId, topology, ctx = {}) {
  const published = { ...topology, source: 'PUBLISHED' };
  const revision = await recordDocumentTopologyRevision({
    documentId,
    documentType: topology.documentType ?? 'LOYALTY_CARD',
    topology: published,
    createdBy: ctx.createdBy ?? null,
    source: 'PUBLISHED',
    approved: true,
  });
  emitDocumentTopologyPublished(published, {
    documentId,
    loyaltyProgramId: ctx.loyaltyProgramId ?? null,
    revisionId: revision.revisionId,
  });
  return revision;
}

export default {
  recordDocumentTopologyRevision,
  listDocumentTopologyRevisions,
  compareDocumentTopologyRevisions,
  recordPublishedTopology,
};
