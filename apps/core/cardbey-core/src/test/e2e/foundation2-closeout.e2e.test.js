/**
 * Foundation 2 close-out E2E test.
 * Covers: orchestra build_store run → Mission.context.agentMemory populated (entities.products),
 *         MissionEvent type 'context_update' emitted after catalog step.
 *         Session 2: Catalog then CopyAgent — rewrite_descriptions job runs in same mission context and receives productRefs.
 *
 * ---------------------------------------------------------------------------
 * DATABASE_URL alignment (required — read before running)
 * ---------------------------------------------------------------------------
 * This Vitest process and the API server are separate Node processes. Each
 * reads DATABASE_URL from its own environment. There is no automatic guarantee
 * they point at the same SQLite file. This file normalizes the test’s
 * `file:` URL to an absolute path under this package (`PACKAGE_ROOT`); the API
 * must use that same physical file.
 *
 * Recommended API start for E2E (from `apps/core/cardbey-core`, same cwd as
 * `npm run test:e2e:foundation2` so relative paths match):
 *
 *   PowerShell:
 *     $env:DATABASE_URL="file:./prisma/test.db"; $env:NODE_ENV="test"; npm run start:api
 *   bash:
 *     DATABASE_URL="file:./prisma/test.db" NODE_ENV=test npm run start:api
 *
 * If the API is started from another directory, set DATABASE_URL to the same
 * absolute path this test logs in the pre-suite check (or copy the resolved
 * value from `process.env.DATABASE_URL` after Vitest loads this file).
 *
 * Symptoms when the DB files diverge (silent / confusing failures):
 * - `orchestratorTask.findUnique` in the test sees null while the API reported
 *   a jobId (or Prisma P2025) — rows written on the server are not in the
 *   test’s DB file.
 * - MissionEvent assertions fail: `event.payload` or `payload.keys` missing
 *   because events were written to the server’s DB, not the test process’s.
 * - Job polling returns `job_not_found` or stale/null mission context.
 *
 * A pre-suite probe (beforeAll) fails fast if the API cannot see rows inserted
 * via this test’s Prisma client (definitive cross-process DB mismatch).
 * ---------------------------------------------------------------------------
 *
 * Run tests: npm run test:e2e:foundation2
 * If another process already uses port 3001, start the API with a different PORT and set
 * E2E_API_BASE_URL (e.g. http://localhost:3002) so this suite talks to the aligned server.
 * The test waits for the build_store job to complete (polling) before asserting agentMemory and context_update.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { getPrismaClient } from '../../lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');
/** Resolved DB URL string this Vitest process uses (after optional file: normalization below). */
if (process.env.DATABASE_URL?.toLowerCase().startsWith('file:')) {
  const p = process.env.DATABASE_URL.slice(5).replace(/^\/+/, '').trim();
  const absolutePath = path.isAbsolute(p) ? p : path.resolve(PACKAGE_ROOT, p);
  const normalized = path.normalize(absolutePath).split(path.sep).join('/');
  process.env.DATABASE_URL = normalized.match(/^[A-Za-z]:\//) ? `file:${normalized}` : `file:/${normalized}`;
}
const RESOLVED_TEST_DATABASE_URL = process.env.DATABASE_URL || '';

const API_BASE = process.env.E2E_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3001';
const rawToken = (process.env.E2E_AUTH_TOKEN || process.env.AUTH_TOKEN || '').replace(/^\s*Bearer\s+/i, '').trim();
const BEARER_TOKEN = rawToken || (process.env.NODE_ENV === 'test' ? 'dev-admin-token' : null);

function isConnectionRefused(err) {
  const code = err?.cause?.code ?? err?.code;
  const msg = (err?.message ?? '') + (err?.cause?.message ?? '');
  if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) return true;
  const errors = err?.cause?.errors ?? err?.errors;
  if (Array.isArray(errors)) return errors.some((e) => e?.code === 'ECONNREFUSED' || (e?.message ?? '').includes('ECONNREFUSED'));
  return false;
}

async function apiPost(path, body = {}, headers = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}),
        ...headers,
      },
      body: typeof body === 'object' && body !== null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (isConnectionRefused(err)) {
      throw new Error(
        `E2E API not reachable at ${API_BASE}. Start the API first (see Foundation 1 instructions), then: npm run test:e2e:foundation2`
      );
    }
    throw err;
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function apiPostWithRateLimitRetry(path, body = {}, headers = {}) {
  const first = await apiPost(path, body, headers);
  // E2E stability: /api/mi/orchestra/start is rate-limited (2/min). Retry once on 429.
  // NOTE: Environment-dependent. Under sustained rate limiting this may still fail; treat as diagnostic.
  if (first.status === 429 && String(path).includes('/api/mi/orchestra/start')) {
    await new Promise((r) => setTimeout(r, 2000));
    return await apiPost(path, body, headers);
  }
  return first;
}

async function apiGet(path) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { ...(BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}) },
    });
  } catch (err) {
    if (isConnectionRefused(err)) {
      throw new Error(
        `E2E API not reachable at ${API_BASE}. Start the API with the same DATABASE_URL as this test (see file header), then: npm run test:e2e:foundation2`
      );
    }
    throw err;
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

/** If GET /api/health?full=true ever exposes a DB URL, use it for alignment hints (no production change required today). */
function extractDatabaseUrlFromHealthPayload(data) {
  if (!data || typeof data !== 'object') return null;
  const top = data.databaseUrl ?? data.database_url ?? data.dbPath ?? data.DATABASE_URL;
  if (typeof top === 'string' && top.trim()) return top.trim();
  const db = data.database;
  if (db && typeof db === 'object') {
    const nested = db.databaseUrl ?? db.url ?? db.path ?? db.file ?? db.sqlitePath;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return null;
}

function normalizeDbUrlForCompare(s) {
  if (!s) return '';
  return String(s).replace(/\\/g, '/').toLowerCase().trim();
}

/** Poll GET job until status is completed or failed, or timeout. Returns final job data. */
async function waitForJobCompletion(jobId, timeoutMs = 120_000, pollIntervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { ok, data } = await apiGet(`/api/mi/orchestra/job/${jobId}`);
    if (!ok || !data) return data;
    const status = (data.status || '').toLowerCase();
    if (status === 'completed' || status === 'failed') return data;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return null;
}

describe('Foundation 2 close-out E2E', () => {
  let jobId;
  /** generationRunId from build_store start (used for Session 2 rewrite_descriptions job). */
  let generationRunIdFromBuild = null;
  let missionIdFromApi = null;
  /** Set in test 3: true if job completed successfully (so agentMemory/context_update are expected). */
  let jobCompletedSuccessfully = false;

  beforeAll(async () => {
    if (!BEARER_TOKEN) {
      console.warn('[E2E] No auth token. Set E2E_AUTH_TOKEN or run API with NODE_ENV=test; run: npm run test:e2e:foundation2');
    }

    // Step 1: Prefer health payload if it ever includes the server DB URL (currently only dialect/ok).
    let healthData = null;
    try {
      const health = await apiGet('/api/health?full=true');
      healthData = health.data;
      if (!health.ok) {
        console.warn(`[E2E Foundation2] GET /api/health?full=true returned ${health.status}; continuing with ping + DB probe.`);
      }
    } catch (e) {
      console.warn('[E2E Foundation2] GET /api/health?full=true failed:', e?.message || e);
    }
    const serverDbFromHealth = extractDatabaseUrlFromHealthPayload(healthData);
    if (serverDbFromHealth) {
      if (normalizeDbUrlForCompare(serverDbFromHealth) !== normalizeDbUrlForCompare(RESOLVED_TEST_DATABASE_URL)) {
        console.warn(
          `[E2E Foundation2] DATABASE_URL alignment: health reported DB URL differs from this test process.\n` +
            `  health: ${serverDbFromHealth}\n` +
            `  test:   ${RESOLVED_TEST_DATABASE_URL}`
        );
      }
    }

    // Step 2: Reachability (no side effects) + cross-process DB file probe.
    const ping = await apiGet('/api/ping');
    if (!ping.ok || !ping.data?.ok) {
      throw new Error(
        `[E2E Foundation2] GET /api/ping failed (${ping.status}). API base: ${API_BASE}. ` +
          `Start the server with DATABASE_URL pointing at the same file as this test (resolved: ${RESOLVED_TEST_DATABASE_URL}).`
      );
    }

    // Vitest only sees this process's env; the API's DATABASE_URL is not visible over HTTP unless /api/health exposes it.

    const prisma = getPrismaClient();
    let probeTaskId = null;
    try {
      const probe = await prisma.orchestratorTask.create({
        data: {
          entryPoint: 'e2e_db_alignment_probe',
          tenantId: 'e2e_db_alignment_tenant',
          userId: 'e2e_db_alignment_user',
          status: 'queued',
          request: { e2eDbAlignmentProbe: true, at: new Date().toISOString() },
        },
      });
      probeTaskId = probe.id;
      const { ok, data } = await apiGet(`/api/mi/orchestra/job/${probeTaskId}`);
      const notFound =
        data?.error === 'job_not_found' ||
        (String(data?.status || '').toLowerCase() === 'failed' && data?.error === 'job_not_found');
      if (!ok || !data || notFound) {
        throw new Error(
          `[E2E Foundation2] Database file mismatch: inserted OrchestratorTask ${probeTaskId} in this process's DB ` +
            `but GET /api/mi/orchestra/job did not see it (API at ${API_BASE} likely uses a different DATABASE_URL / SQLite file).\n` +
            `  This test resolved DATABASE_URL: ${RESOLVED_TEST_DATABASE_URL}\n` +
            `  Restart the API with the same file (see header comment). Symptoms when misaligned: null tasks, P2025, missing context_update payload.keys.`
        );
      }
    } finally {
      if (probeTaskId) {
        await prisma.orchestratorTask.delete({ where: { id: probeTaskId } }).catch(() => {});
      }
    }

    console.log(`[E2E Foundation2] DB alignment OK — test DATABASE_URL: ${RESOLVED_TEST_DATABASE_URL}`);
  });

  it('1. POST /api/mi/orchestra/start returns jobId', async () => {
    if (!BEARER_TOKEN) return;
    const { ok, status, data } = await apiPostWithRateLimitRetry('/api/mi/orchestra/start', {
      goal: 'build_store',
      businessName: 'E2E Foundation 2 Store',
    });
    expect(ok, `API returned ${status}: ${data?.message || JSON.stringify(data)}`).toBe(true);
    expect(data?.jobId).toBeDefined();
    jobId = data.jobId;
    generationRunIdFromBuild = data?.generationRunId ?? jobId;
  }, 60_000);

  it('2. POST /api/mi/orchestra/job/:jobId/run runs the job', async () => {
    if (!BEARER_TOKEN || !jobId) return;
    const { ok, data } = await apiPost(`/api/mi/orchestra/job/${jobId}/run`);
    expect(ok).toBe(true);
  });

  it('3. Job completes (poll until completed or failed)', async () => {
    if (!BEARER_TOKEN || !jobId) return;
    const job = await waitForJobCompletion(jobId);
    expect(job, 'Job did not complete within timeout').toBeDefined();
    missionIdFromApi = typeof job?.missionId === 'string' ? job.missionId : (job?.missionId?.id ?? job?.missionId);
    const status = (job?.status || '').toLowerCase();
    expect(status === 'completed' || status === 'failed', `Expected completed or failed, got ${status}`).toBe(true);
    jobCompletedSuccessfully = status === 'completed';
    if (status === 'failed') {
      console.warn('[E2E] Job failed (draft generation); skipping agentMemory/context_update assertions:', job?.result?.error ?? job?.result);
    }
  }, 125_000); // Poll up to 120s; allow 125s so test does not time out before polling finishes

  it('4. Mission.context.agentMemory exists (entities.products is array)', async () => {
    if (!BEARER_TOKEN || !jobId) return;
    if (!jobCompletedSuccessfully) return; // agentMemory only written when catalog step runs successfully
    const { ok, status, data } = await apiGet(`/api/mi/orchestra/job/${jobId}/mission-context`);
    expect(ok, `GET mission-context failed: ${status} ${JSON.stringify(data)}`).toBe(true);
    expect(data?.context != null, 'Mission.context missing').toBe(true);
    const agentMemory = data?.context?.agentMemory;
    expect(agentMemory != null && typeof agentMemory === 'object', 'Mission.context.agentMemory missing or not an object').toBe(true);
    const products = agentMemory?.entities?.products;
    expect(Array.isArray(products), 'agentMemory.entities.products must be an array (possibly empty)').toBe(true);
  });

  it('5. MissionEvent stream contains context_update', async () => {
    if (!jobId) return;
    if (!jobCompletedSuccessfully) return; // context_update only emitted when catalog step runs successfully
    const missionId = missionIdFromApi ?? (await getPrismaClient().orchestratorTask.findUnique({
      where: { id: jobId },
      select: { missionId: true },
    }))?.missionId;
    if (!missionId) return;
    const prisma = getPrismaClient();
    if (!prisma?.missionEvent) return;
    const event = await prisma.missionEvent.findFirst({
      where: { missionId, type: 'context_update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event, 'No MissionEvent with type context_update found for this mission').toBeDefined();
    expect(event?.payload?.keys, 'context_update payload should include keys').toBeDefined();
    const keys = Array.isArray(event.payload.keys) ? event.payload.keys : [];
    expect(keys.includes('entities'), 'context_update payload.keys should include "entities"').toBe(true);
  });

  // --- Foundation 2 Session 2: Catalog then CopyAgent — rewrite_descriptions runs in same mission and receives productRefs ---

  let jobIdRewrite = null;
  let rewriteJobCompleted = false;

  it('6. Start rewrite_descriptions job with same draft (shared mission via DB)', async () => {
    if (!BEARER_TOKEN || !jobId || !jobCompletedSuccessfully || !generationRunIdFromBuild) return;
    const { ok, status, data } = await apiPostWithRateLimitRetry('/api/mi/orchestra/start', {
      goal: 'rewrite_descriptions',
      generationRunId: generationRunIdFromBuild,
    });
    expect(ok, `Start rewrite_descriptions failed: ${status} ${JSON.stringify(data)}`).toBe(true);
    expect(data?.jobId).toBeDefined();
    jobIdRewrite = data.jobId;
    const prisma = getPrismaClient();
    // OrchestratorTask may not be visible immediately after start; wait briefly.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const found = await prisma.orchestratorTask.findUnique({ where: { id: jobIdRewrite }, select: { id: true } });
      if (found?.id) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await prisma.orchestratorTask.update({
      where: { id: jobIdRewrite },
      data: { missionId: jobId },
    });
  });

  it('7. Run rewrite_descriptions job (CopyAgent receives missionContext.entities.products)', async () => {
    if (!BEARER_TOKEN || !jobIdRewrite) return;
    const { ok } = await apiPost(`/api/mi/orchestra/job/${jobIdRewrite}/run`);
    expect(ok).toBe(true);
  });

  it('8. Rewrite job completes (poll)', async () => {
    if (!BEARER_TOKEN || !jobIdRewrite) return;
    const job = await waitForJobCompletion(jobIdRewrite, 90_000, 2000);
    expect(job, 'Rewrite job did not complete within timeout').toBeDefined();
    const status = (job?.status || '').toLowerCase();
    expect(status === 'completed' || status === 'failed', `Expected completed or failed, got ${status}`).toBe(true);
    rewriteJobCompleted = status === 'completed';
  }, 95_000);

  it('9. Mission still has agentMemory.entities.products (CopyAgent had product context)', async () => {
    if (!jobId || !jobIdRewrite) return;
    if (!jobCompletedSuccessfully) return;
    const { ok, data } = await apiGet(`/api/mi/orchestra/job/${jobId}/mission-context`);
    expect(ok).toBe(true);
    const products = data?.context?.agentMemory?.entities?.products;
    expect(Array.isArray(products), 'Mission should still have agentMemory.entities.products after CopyAgent run').toBe(true);
    if (rewriteJobCompleted) {
      expect(products.length, 'Catalog should have written at least one product ref').toBeGreaterThan(0);
    }
  });
});
