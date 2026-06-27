import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_RECENT_BUFFER } from './diagnosticTypes.js';
import { classifyRuntimeDiagnostic, buildCursorPacket } from './diagnosticClassifier.js';
import { sanitizeDiagnosticPayload } from './diagnosticSanitizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSONL_DIR = path.resolve(__dirname, '../../.cache/runtime-diagnostics');

/** @type {Array<Record<string, unknown>>} */
const recentBuffer = [];

let jsonlPath = null;

export function isRuntimeDiagnosticsEnabled() {
  const raw = String(process.env.RUNTIME_DIAGNOSTICS_ENABLED ?? 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function resolveJsonlPath() {
  if (jsonlPath) return jsonlPath;
  const dir = process.env.RUNTIME_DIAGNOSTICS_JSONL_DIR?.trim() || DEFAULT_JSONL_DIR;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* non-fatal */
  }
  jsonlPath = path.join(dir, 'events.jsonl');
  return jsonlPath;
}

/**
 * @param {Record<string, unknown>} record
 */
function appendJsonl(record) {
  if (!isRuntimeDiagnosticsEnabled()) return;
  try {
    const line = `${JSON.stringify(record)}\n`;
    fs.appendFileSync(resolveJsonlPath(), line, { encoding: 'utf8' });
  } catch (err) {
    console.warn('[RuntimeDiagnostics] jsonl append failed', err?.message || err);
  }
}

/** @type {Map<string, number>} */
const recentIngestSignatures = new Map();
const INGEST_SIGNATURE_TTL_MS = 60_000;

function buildIngestSignature(sanitized, ctx) {
  const evidence =
    sanitized.evidence && typeof sanitized.evidence === 'object' ? sanitized.evidence : {};
  const endpoint = typeof evidence.endpoint === 'string' ? evidence.endpoint.split('?')[0] : '';
  const status = evidence.status != null ? String(evidence.status) : '';
  const ip = ctx.ip ? String(ctx.ip) : '';
  return [sanitized.eventName, sanitized.category, endpoint, status, ip].join('|');
}

function shouldSkipDuplicateIngest(signature) {
  const now = Date.now();
  const prev = recentIngestSignatures.get(signature);
  if (prev && now - prev < INGEST_SIGNATURE_TTL_MS) return true;
  recentIngestSignatures.set(signature, now);
  if (recentIngestSignatures.size > 500) {
    for (const [key, ts] of recentIngestSignatures) {
      if (now - ts > INGEST_SIGNATURE_TTL_MS) recentIngestSignatures.delete(key);
    }
  }
  return false;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {{ userId?: string|null, ip?: string|null }} ctx
 */
export function ingestRuntimeDiagnostic(payload, ctx = {}) {
  if (!isRuntimeDiagnosticsEnabled()) {
    return { ok: false, disabled: true };
  }

  const authenticated = Boolean(ctx.userId);
  const sanitized = sanitizeDiagnosticPayload(
    {
      ...payload,
      userId: ctx.userId ?? payload.userId ?? null,
    },
    { authenticated },
  );

  const signature = buildIngestSignature(sanitized, ctx);
  if (shouldSkipDuplicateIngest(signature)) {
    return { ok: true, deduped: true };
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const classification = classifyRuntimeDiagnostic(sanitized);

  const record = {
    id,
    createdAt,
    status: 'open',
    source: sanitized.source,
    severity: sanitized.severity,
    category: sanitized.category,
    eventName: sanitized.eventName,
    message: sanitized.message,
    route: sanitized.route,
    userId: sanitized.userId ?? null,
    storeId: sanitized.storeId,
    draftId: sanitized.draftId,
    missionId: sanitized.missionId,
    generationRunId: sanitized.generationRunId,
    deploymentJson: sanitized.deployment,
    browserJson: sanitized.browser,
    evidenceJson: sanitized.evidence,
    breadcrumbsJson: sanitized.breadcrumbs,
    rawErrorJson: sanitized.rawError,
    classificationJson: classification,
    clientIp: ctx.ip ? String(ctx.ip).slice(0, 64) : null,
    cursorPacket: buildCursorPacket({ ...sanitized, id }, classification),
  };

  recentBuffer.unshift(record);
  if (recentBuffer.length > MAX_RECENT_BUFFER) {
    recentBuffer.length = MAX_RECENT_BUFFER;
  }

  appendJsonl({
    id,
    createdAt,
    severity: record.severity,
    category: record.category,
    eventName: record.eventName,
    message: record.message,
    classification,
  });

  console.log('[RUNTIME_DIAGNOSTIC_INGEST]', {
    id,
    eventName: record.eventName,
    category: record.category,
    kind: classification.kind,
    severity: record.severity,
  });

  return {
    ok: true,
    diagnosticId: id,
    classification,
    cursorPacket: record.cursorPacket,
  };
}

/**
 * @param {{ storeId?: string, missionId?: string, severity?: string, limit?: number }} query
 */
export function listRecentRuntimeDiagnostics(query = {}) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  let rows = [...recentBuffer];

  if (query.storeId) {
    rows = rows.filter((r) => r.storeId === query.storeId);
  }
  if (query.missionId) {
    rows = rows.filter((r) => r.missionId === query.missionId);
  }
  if (query.severity) {
    rows = rows.filter((r) => r.severity === query.severity);
  }

  return rows.slice(0, limit).map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    severity: r.severity,
    category: r.category,
    eventName: r.eventName,
    message: r.message,
    route: r.route,
    storeId: r.storeId,
    draftId: r.draftId,
    missionId: r.missionId,
    classification: r.classificationJson,
    cursorPacket: r.cursorPacket,
  }));
}

/** @internal test helper */
export function clearRuntimeDiagnosticsForTests() {
  recentBuffer.length = 0;
  jsonlPath = null;
}
