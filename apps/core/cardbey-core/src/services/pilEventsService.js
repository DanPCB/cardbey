/**
 * PIL event ingestion — observe-only persistence (no execution side effects).
 */
import { prisma } from '../lib/prisma.js';
import { record as recordFoundationMetric } from '../lib/metrics/foundationMetrics.js';

const MAX_BATCH = 50;

let loggedPilEventTableMissing = false;

function isSqliteDatabase() {
  const url = String(process.env.DATABASE_URL ?? '').toLowerCase();
  return url.startsWith('file:') || url.includes('.db') || url.includes('sqlite');
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isPilEventTableMissingError(err) {
  if (!err || typeof err !== 'object') return false;
  const code = /** @type {{ code?: string }} */ (err).code;
  if (code !== 'P2021') return false;
  const msg = String(/** @type {{ message?: string }} */ (err).message ?? '').toLowerCase();
  return msg.includes('pilevent');
}

function shouldFallbackMissingPilEventTable(err) {
  if (process.env.NODE_ENV === 'production') return false;
  if (!isSqliteDatabase()) return false;
  return isPilEventTableMissingError(err);
}

function logPilEventTableMissingOnce(extra = {}) {
  if (loggedPilEventTableMissing) return;
  loggedPilEventTableMissing = true;
  console.warn(
    JSON.stringify({
      event: 'PIL_EVENT_TABLE_MISSING',
      ts: new Date().toISOString(),
      message: 'PilEvent table missing on local SQLite; run node scripts/repair-sqlite-schema.mjs',
      ...extra,
    }),
  );
}

/**
 * @returns {{ persisted: false; reason: 'PIL_EVENT_TABLE_MISSING' }}
 */
export function pilEventTableMissingNoop() {
  return { persisted: false, reason: 'PIL_EVENT_TABLE_MISSING' };
}

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
  const eventType = String(input.type ?? 'unknown').slice(0, 120);

  try {
    const row = await prisma.pilEvent.create({
      data: {
        type: eventType,
        timestamp: normalizeTimestamp(input.timestamp),
        sessionId: input.sessionId ? String(input.sessionId).slice(0, 128) : null,
        userId: input.userId ? String(input.userId).slice(0, 128) : null,
        entityType: input.entityType ? String(input.entityType).slice(0, 64) : null,
        entityId: input.entityId ? String(input.entityId).slice(0, 256) : null,
        storeId,
        metadata,
      },
    });
    recordFoundationMetric('pil_event_ingest_total', { eventType });
    return { ...row, persisted: true };
  } catch (err) {
    if (shouldFallbackMissingPilEventTable(err)) {
      logPilEventTableMissingOnce({ operation: 'recordPilEvent', type: eventType });
      return { id: null, type: eventType, ...pilEventTableMissingNoop() };
    }
    throw err;
  }
}

/**
 * @param {object[]} events
 * @returns {Promise<{ count: number; persisted?: boolean; reason?: string }>}
 */
export async function recordPilEventBatch(events) {
  const list = Array.isArray(events) ? events.slice(0, MAX_BATCH) : [];
  if (list.length === 0) return { count: 0, persisted: true };

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

  try {
    const result = await prisma.pilEvent.createMany({ data });
    for (const row of data) {
      recordFoundationMetric('pil_event_ingest_total', { eventType: row.type });
    }
    return { count: result.count, persisted: true };
  } catch (err) {
    if (shouldFallbackMissingPilEventTable(err)) {
      logPilEventTableMissingOnce({ operation: 'recordPilEventBatch', batchSize: data.length });
      return { count: 0, ...pilEventTableMissingNoop() };
    }
    throw err;
  }
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

  try {
    return await prisma.pilEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  } catch (err) {
    if (shouldFallbackMissingPilEventTable(err)) {
      logPilEventTableMissingOnce({ operation: 'getRecentPilEvents' });
      return [];
    }
    throw err;
  }
}

export async function getPilEventVolumeSummary(storeId) {
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const base = storeId ? { storeId: String(storeId) } : {};

  try {
    const [count24h, count7d] = await Promise.all([
      prisma.pilEvent.count({ where: { ...base, timestamp: { gte: since24 } } }),
      prisma.pilEvent.count({ where: { ...base, timestamp: { gte: since7 } } }),
    ]);
    return { count24h, count7d, storageHealth: 'persisted' };
  } catch (err) {
    if (shouldFallbackMissingPilEventTable(err)) {
      logPilEventTableMissingOnce({ operation: 'getPilEventVolumeSummary' });
      return { count24h: 0, count7d: 0, storageHealth: 'table_missing' };
    }
    throw err;
  }
}

/** @internal tests */
export function resetPilEventTableMissingLogForTests() {
  loggedPilEventTableMissing = false;
}
