/**
 * PIL event ingestion — observe-only persistence (no execution side effects).
 */
import { prisma } from '../lib/prisma.js';

const MAX_BATCH = 50;

function normalizeTimestamp(ts) {
  if (!ts) return new Date();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function extractStoreId(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const sid = metadata.storeId;
  return sid != null && String(sid).trim() ? String(sid).trim() : null;
}

/**
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function recordPilEvent(input) {
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const storeId = extractStoreId(metadata);

  return prisma.pilEvent.create({
    data: {
      type: String(input.type ?? 'unknown').slice(0, 120),
      timestamp: normalizeTimestamp(input.timestamp),
      sessionId: input.sessionId ? String(input.sessionId).slice(0, 128) : null,
      userId: input.userId ? String(input.userId).slice(0, 128) : null,
      entityType: input.entityType ? String(input.entityType).slice(0, 64) : null,
      entityId: input.entityId ? String(input.entityId).slice(0, 256) : null,
      storeId,
      metadata,
    },
  });
}

/**
 * @param {object[]} events
 * @returns {Promise<{ count: number }>}
 */
export async function recordPilEventBatch(events) {
  const list = Array.isArray(events) ? events.slice(0, MAX_BATCH) : [];
  if (list.length === 0) return { count: 0 };

  const data = list.map((input) => {
    const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
    return {
      type: String(input.type ?? 'unknown').slice(0, 120),
      timestamp: normalizeTimestamp(input.timestamp),
      sessionId: input.sessionId ? String(input.sessionId).slice(0, 128) : null,
      userId: input.userId ? String(input.userId).slice(0, 128) : null,
      entityType: input.entityType ? String(input.entityType).slice(0, 64) : null,
      entityId: input.entityId ? String(input.entityId).slice(0, 256) : null,
      storeId: extractStoreId(metadata),
      metadata,
    };
  });

  const result = await prisma.pilEvent.createMany({ data });
  return { count: result.count };
}

/**
 * Recent events for admin / store diagnostics.
 * @param {{ storeId?: string, sessionId?: string, limit?: number }} opts
 */
export async function getRecentPilEvents(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const where = {};
  if (opts.storeId) where.storeId = String(opts.storeId);
  if (opts.sessionId) where.sessionId = String(opts.sessionId);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  where.timestamp = { gte: since };

  return prisma.pilEvent.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

export async function getPilEventVolumeSummary(storeId) {
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const base = storeId ? { storeId: String(storeId) } : {};

  const [count24h, count7d] = await Promise.all([
    prisma.pilEvent.count({ where: { ...base, timestamp: { gte: since24 } } }),
    prisma.pilEvent.count({ where: { ...base, timestamp: { gte: since7 } } }),
  ]);

  return { count24h, count7d, storageHealth: 'persisted' };
}
