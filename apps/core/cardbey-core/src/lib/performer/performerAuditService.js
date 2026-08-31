/**
 * Performer create-store understanding audit — durable Core storage (Phase 4).
 * Dual-DB safe (cuid IDs). Phone/website stripped before persist.
 */

import { getPrismaClient } from '../prisma.js';

export const PERFORMER_AUDIT_STEPS = new Set([
  'upload',
  'hashing',
  'ocr',
  'bue',
  'validation',
  'user_review',
  'create_store',
  'confirm',
  'retry',
  'blocked',
  'stale_cleared',
]);

const MAX_SESSION = 128;
const MAX_HASH = 128;
const MAX_STR = 256;
const MAX_ERROR = 2000;
const MAX_BATCH = 100;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 100;

/** @type {Map<string, number[]>} */
const rateBuckets = new Map();

function trimStr(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * Drop PII fields before storage.
 * @param {Record<string, unknown> | null} fields
 */
export function sanitizeAuditFields(fields) {
  const f = asRecord(fields);
  if (!f) return null;
  const out = { ...f };
  delete out.phone;
  delete out.website;
  delete out.email;
  return out;
}

/**
 * @param {string} sessionId
 * @returns {boolean}
 */
export function checkAuditRateLimit(sessionId) {
  const key = String(sessionId || 'anon').slice(0, MAX_SESSION) || 'anon';
  const now = Date.now();
  const prev = rateBuckets.get(key) ?? [];
  const next = prev.filter((t) => now - t < RATE_WINDOW_MS);
  if (next.length >= RATE_MAX_PER_WINDOW) {
    rateBuckets.set(key, next);
    return false;
  }
  next.push(now);
  rateBuckets.set(key, next);
  return true;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function parseAuditEntry(body) {
  const b = asRecord(body) ?? {};
  const step = trimStr(b.step, 64);
  if (!step || !PERFORMER_AUDIT_STEPS.has(step)) {
    return { ok: false, error: 'invalid_step' };
  }
  const sessionId = trimStr(b.sessionId, MAX_SESSION);
  if (!sessionId) return { ok: false, error: 'missing_sessionId' };
  const imageHash = trimStr(b.imageHash, MAX_HASH) || 'unknown';
  const confidenceRaw = Number(b.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, confidenceRaw))
    : null;
  const validation = asRecord(b.validationResult);
  const metadata = asRecord(b.metadata) ?? {};
  return {
    ok: true,
    data: {
      sessionId,
      step,
      imageHash,
      understandingId: trimStr(b.understandingId, MAX_STR),
      source: trimStr(b.source, 64),
      confidence,
      fields: sanitizeAuditFields(b.fields),
      validationResult: validation
        ? {
            valid: validation.valid === true,
            missingFields: Array.isArray(validation.missingFields)
              ? validation.missingFields.map(String).slice(0, 20)
              : Array.isArray(validation.errors)
                ? []
                : [],
            errors: Array.isArray(validation.errors)
              ? validation.errors.map(String).slice(0, 20)
              : [],
            warnings: Array.isArray(validation.warnings)
              ? validation.warnings.map(String).slice(0, 20)
              : [],
          }
        : null,
      userAction: trimStr(b.userAction, 64),
      userEdits: sanitizeAuditFields(b.userEdits),
      error: trimStr(b.error, MAX_ERROR),
      metadata,
      environment: trimStr(metadata.environment ?? b.environment, 64),
    },
  };
}

/**
 * @param {object} data
 * @param {{ userId?: string | null }} [opts]
 */
export async function logPerformerAuditEntry(data, opts = {}) {
  const prisma = getPrismaClient();
  const row = await prisma.performerAuditLog.create({
    data: {
      sessionId: data.sessionId,
      userId: opts.userId ?? data.userId ?? null,
      step: data.step,
      imageHash: data.imageHash,
      understandingId: data.understandingId,
      source: data.source,
      confidence: data.confidence,
      fields: data.fields ?? undefined,
      validationResult: data.validationResult ?? undefined,
      userAction: data.userAction,
      userEdits: data.userEdits ?? undefined,
      error: data.error,
      metadata: data.metadata ?? undefined,
      environment: data.environment,
    },
  });
  return row;
}

/**
 * Fire-and-forget batch insert (async, non-blocking for caller when used with void).
 * @param {object[]} entries
 * @param {{ userId?: string | null }} [opts]
 */
export async function logPerformerAuditBatch(entries, opts = {}) {
  const list = Array.isArray(entries) ? entries.slice(0, MAX_BATCH) : [];
  const ids = [];
  for (const entry of list) {
    const parsed = parseAuditEntry(entry);
    if (!parsed.ok) continue;
    if (!checkAuditRateLimit(parsed.data.sessionId)) continue;
    try {
      const row = await logPerformerAuditEntry(parsed.data, opts);
      ids.push(row.id);
    } catch (err) {
      console.warn('[PerformerAudit] insert failed:', err?.message ?? err);
    }
  }
  return ids;
}

function parseDateRange(query = {}) {
  const now = Date.now();
  const range = String(query.dateRange ?? query.range ?? '7d').trim();
  let startMs = now - 7 * 24 * 60 * 60 * 1000;
  if (range === '24h') startMs = now - 24 * 60 * 60 * 1000;
  else if (range === '30d') startMs = now - 30 * 24 * 60 * 60 * 1000;
  else if (range === '90d') startMs = now - 90 * 24 * 60 * 60 * 1000;
  if (query.startDate) {
    const t = Date.parse(String(query.startDate));
    if (Number.isFinite(t)) startMs = t;
  }
  let endMs = now;
  if (query.endDate) {
    const t = Date.parse(String(query.endDate));
    if (Number.isFinite(t)) endMs = t;
  }
  return { start: new Date(startMs), end: new Date(endMs) };
}

/**
 * @param {Record<string, unknown>} query
 */
export async function getPerformerAuditMetrics(query = {}) {
  const prisma = getPrismaClient();
  const { start, end } = parseDateRange(query);
  const sourceFilter = trimStr(query.source, 64);
  const confMin = Number(query.confidenceMin);
  const confMax = Number(query.confidenceMax);

  const where = {
    createdAt: { gte: start, lte: end },
    ...(sourceFilter && sourceFilter !== 'all' ? { source: sourceFilter } : {}),
    ...(Number.isFinite(confMin) || Number.isFinite(confMax)
      ? {
          confidence: {
            ...(Number.isFinite(confMin) ? { gte: confMin } : {}),
            ...(Number.isFinite(confMax) ? { lte: confMax } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.performerAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: {
      id: true,
      step: true,
      source: true,
      confidence: true,
      validationResult: true,
      userAction: true,
      imageHash: true,
      fields: true,
      error: true,
      createdAt: true,
    },
  });

  const validationRows = rows.filter((r) => r.step === 'validation' || r.step === 'blocked');
  const createRows = rows.filter((r) => r.step === 'create_store');
  const retryRows = rows.filter(
    (r) => r.step === 'retry' || r.userAction === 'retried' || r.userAction === 'cancelled',
  );
  const bueRows = rows.filter(
    (r) => r.step === 'bue' || r.source === 'bue' || r.source === 'mixed',
  );

  let validCount = 0;
  for (const r of validationRows) {
    const vr = asRecord(r.validationResult);
    if (vr?.valid === true) validCount += 1;
  }
  const successRate =
    validationRows.length > 0 ? Math.round((validCount / validationRows.length) * 1000) / 10 : 100;

  const confValues = rows
    .map((r) => r.confidence)
    .filter((c) => typeof c === 'number' && Number.isFinite(c));
  const avgConfidence =
    confValues.length > 0
      ? Math.round((confValues.reduce((a, b) => a + b, 0) / confValues.length) * 10) / 10
      : 0;

  const sessions = new Set(rows.map((r) => r.imageHash).filter(Boolean));
  const retryRate =
    sessions.size > 0
      ? Math.round((retryRows.length / Math.max(sessions.size, 1)) * 1000) / 10
      : 0;
  const bueUsage =
    rows.length > 0 ? Math.round((bueRows.length / rows.length) * 1000) / 10 : 0;

  const errorRows = rows.filter((r) => Boolean(r.error) || r.step === 'blocked');
  const errorRate =
    rows.length > 0 ? Math.round((errorRows.length / rows.length) * 1000) / 10 : 0;

  /** @type {Record<string, number>} */
  const sourceBreakdown = {};
  for (const r of rows) {
    const s = r.source || 'unknown';
    sourceBreakdown[s] = (sourceBreakdown[s] || 0) + 1;
  }

  /** @type {Record<string, number>} */
  const missingFields = {};
  for (const r of validationRows) {
    const vr = asRecord(r.validationResult);
    const missing = Array.isArray(vr?.missingFields) ? vr.missingFields : [];
    const errors = Array.isArray(vr?.errors) ? vr.errors : [];
    for (const m of missing) {
      const key = String(m);
      missingFields[key] = (missingFields[key] || 0) + 1;
    }
    for (const e of errors) {
      if (/category/i.test(String(e))) missingFields.category = (missingFields.category || 0) + 1;
      if (/location/i.test(String(e))) missingFields.location = (missingFields.location || 0) + 1;
      if (/name/i.test(String(e))) missingFields.businessName = (missingFields.businessName || 0) + 1;
    }
  }

  const recentFailures = validationRows
    .filter((r) => {
      const vr = asRecord(r.validationResult);
      return vr?.valid === false || r.step === 'blocked' || Boolean(r.error);
    })
    .slice(0, 20)
    .map((r) => {
      const vr = asRecord(r.validationResult);
      const fields = asRecord(r.fields);
      return {
        id: r.id,
        createdAt: r.createdAt,
        imageHash: r.imageHash,
        confidence: r.confidence,
        missingFields: vr?.missingFields ?? [],
        errors: vr?.errors ?? (r.error ? [r.error] : []),
        businessName: fields?.businessName ?? null,
      };
    });

  const alerts = evaluateAuditAlerts({
    successRate,
    avgConfidence,
    errorRate,
    retryRate,
  });

  return {
    successRate,
    avgConfidence,
    retryRate,
    bueUsage,
    errorRate,
    totalEvents: rows.length,
    createStoreEvents: createRows.length,
    sourceBreakdown,
    missingFields,
    recentFailures,
    alerts,
    range: { start: start.toISOString(), end: end.toISOString() },
  };
}

/**
 * @param {{ successRate: number; avgConfidence: number; errorRate: number; retryRate: number }} m
 */
export function evaluateAuditAlerts(m) {
  const alerts = [];
  if (m.successRate < 60) {
    alerts.push({
      severity: 'critical',
      type: 'success_rate',
      message: 'Understanding success rate dropped critically',
      action: 'Inspect recent failures and BUE/OCR coverage',
    });
  } else if (m.successRate < 75) {
    alerts.push({
      severity: 'warning',
      type: 'success_rate',
      message: 'Understanding success rate below threshold',
      action: 'Review missing-field distribution',
    });
  }
  if (m.avgConfidence < 50) {
    alerts.push({
      severity: 'critical',
      type: 'avg_confidence',
      message: 'Average confidence critically low',
      action: 'Check OCR/BUE pipeline health',
    });
  } else if (m.avgConfidence < 65) {
    alerts.push({
      severity: 'warning',
      type: 'avg_confidence',
      message: 'Average confidence below threshold',
      action: 'Tune confidence scoring / extraction',
    });
  }
  if (m.errorRate > 15) {
    alerts.push({
      severity: 'critical',
      type: 'error_rate',
      message: 'Error rate critically high',
      action: 'Inspect blocked/error audit rows',
    });
  } else if (m.errorRate > 8) {
    alerts.push({
      severity: 'warning',
      type: 'error_rate',
      message: 'Error rate above threshold',
      action: 'Review blocked create-store attempts',
    });
  }
  return alerts;
}

/**
 * @param {Record<string, unknown>} query
 */
export async function getPerformerAuditTrends(query = {}) {
  const prisma = getPrismaClient();
  const { start, end } = parseDateRange(query);
  const rows = await prisma.performerAuditLog.findMany({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
    take: 8000,
    select: {
      createdAt: true,
      confidence: true,
      step: true,
      metadata: true,
      validationResult: true,
    },
  });

  /** @type {Record<string, { count: number; confSum: number; confN: number; valid: number; validationN: number; latencySum: number; latencyN: number }>} */
  const byDay = {};
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    if (!byDay[day]) {
      byDay[day] = {
        count: 0,
        confSum: 0,
        confN: 0,
        valid: 0,
        validationN: 0,
        latencySum: 0,
        latencyN: 0,
      };
    }
    const bucket = byDay[day];
    bucket.count += 1;
    if (typeof r.confidence === 'number') {
      bucket.confSum += r.confidence;
      bucket.confN += 1;
    }
    if (r.step === 'validation' || r.step === 'blocked') {
      bucket.validationN += 1;
      const vr = asRecord(r.validationResult);
      if (vr?.valid === true) bucket.valid += 1;
    }
    const meta = asRecord(r.metadata);
    const latency = Number(meta?.latencyMs);
    if (Number.isFinite(latency) && latency >= 0) {
      bucket.latencySum += latency;
      bucket.latencyN += 1;
    }
  }

  const days = Object.keys(byDay).sort();
  return {
    confidence: days.map((d) => ({
      day: d,
      avg: byDay[d].confN ? Math.round((byDay[d].confSum / byDay[d].confN) * 10) / 10 : 0,
    })),
    success: days.map((d) => ({
      day: d,
      rate: byDay[d].validationN
        ? Math.round((byDay[d].valid / byDay[d].validationN) * 1000) / 10
        : 100,
    })),
    latency: days.map((d) => ({
      day: d,
      avgMs: byDay[d].latencyN
        ? Math.round(byDay[d].latencySum / byDay[d].latencyN)
        : 0,
    })),
  };
}

export async function getPerformerAuditFailures({ limit = 20, offset = 0 } = {}) {
  const prisma = getPrismaClient();
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = Math.max(Number(offset) || 0, 0);
  const rows = await prisma.performerAuditLog.findMany({
    where: {
      OR: [{ step: 'blocked' }, { error: { not: null } }],
    },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    step: r.step,
    imageHash: r.imageHash,
    confidence: r.confidence,
    source: r.source,
    validationResult: r.validationResult,
    fields: sanitizeAuditFields(asRecord(r.fields)),
    error: r.error,
  }));
}

export async function getPerformerAuditDetail(id) {
  const prisma = getPrismaClient();
  const row = await prisma.performerAuditLog.findUnique({ where: { id: String(id) } });
  if (!row) return null;
  return {
    ...row,
    fields: sanitizeAuditFields(asRecord(row.fields)),
  };
}

/**
 * Optional Slack notify (no-op without webhook).
 * @param {Array<{ severity: string; message: string; action?: string }>} alerts
 */
export async function maybeSendPerformerAuditSlackAlerts(alerts) {
  const url = String(process.env.PERFORMER_AUDIT_SLACK_WEBHOOK || '').trim();
  if (!url || !alerts?.length) return;
  for (const alert of alerts) {
    if (alert.severity !== 'critical' && alert.severity !== 'warning') continue;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${alert.severity === 'critical' ? '🚨' : '⚠️'} ${alert.message}${
            alert.action ? ` — ${alert.action}` : ''
          }`,
        }),
      });
    } catch (err) {
      console.warn('[PerformerAudit] slack alert failed:', err?.message ?? err);
    }
  }
}

export default {
  parseAuditEntry,
  sanitizeAuditFields,
  checkAuditRateLimit,
  logPerformerAuditEntry,
  logPerformerAuditBatch,
  getPerformerAuditMetrics,
  getPerformerAuditTrends,
  getPerformerAuditFailures,
  getPerformerAuditDetail,
  evaluateAuditAlerts,
  maybeSendPerformerAuditSlackAlerts,
};
