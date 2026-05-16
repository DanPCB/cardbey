/**
 * M3 Checkpoints close-out E2E test.
 * Verifies: build_store run emits step_started / step_completed / step_checkpoint,
 *           Mission.context.missionPlan[jobId].steps all reach status 'completed'.
 *
 * Prerequisites:
 * - API must use the SAME database as the test (e.g. DATABASE_URL=file:./prisma/test.db).
 * - Start API: $env:DATABASE_URL="file:./prisma/test.db"; $env:NODE_ENV="test"; npm run start:api
 * - Run: npm run test:e2e:m3-checkpoints
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { getPrismaClient } from '../../lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');
if (process.env.DATABASE_URL?.toLowerCase().startsWith('file:')) {
  const p = process.env.DATABASE_URL.slice(5).replace(/^\/+/, '').trim();
  const absolutePath = path.isAbsolute(p) ? p : path.resolve(PACKAGE_ROOT, p);
  const normalized = path.normalize(absolutePath).split(path.sep).join('/');
  process.env.DATABASE_URL = normalized.match(/^[A-Za-z]:\//) ? `file:${normalized}` : `file:/${normalized}`;
}

const API_BASE = process.env.E2E_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3001';
const rawToken = (process.env.E2E_AUTH_TOKEN || process.env.AUTH_TOKEN || '').replace(/^\s*Bearer\s+/i, '').trim();
const BEARER_TOKEN = rawToken || (process.env.NODE_ENV === 'test' ? 'dev-admin-token' : null);

const EXPECTED_STEP_IDS = ['research', 'catalog', 'media', 'copy'];

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
        `E2E API not reachable at ${API_BASE}. Start the API first, then: npm run test:e2e:m3-checkpoints`
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

async function apiGet(path) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...(BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

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

describe('M3 Checkpoints close-out E2E', () => {
  let jobId;
  let missionIdFromApi = null;
  let jobCompletedSuccessfully = false;

  beforeAll(() => {
    if (!BEARER_TOKEN) {
      console.warn('[E2E] No auth token. Set E2E_AUTH_TOKEN or run API with NODE_ENV=test; run: npm run test:e2e:m3-checkpoints');
    }
  });

  it('1. POST /api/mi/orchestra/start returns jobId', async () => {
    if (!BEARER_TOKEN) return;
    const { ok, status, data } = await apiPost('/api/mi/orchestra/start', {
      goal: 'build_store',
      businessName: 'E2E M3 Checkpoints Store',
    });
    expect(ok, `API returned ${status}: ${data?.message || JSON.stringify(data)}`).toBe(true);
    expect(data?.jobId).toBeDefined();
    jobId = data.jobId;
  });

  it('2. POST /api/mi/orchestra/job/:jobId/run runs the job', async () => {
    if (!BEARER_TOKEN || !jobId) return;
    const { ok } = await apiPost(`/api/mi/orchestra/job/${jobId}/run`);
    expect(ok).toBe(true);
  });

  it('3. Job reaches completed status', async () => {
    if (!BEARER_TOKEN || !jobId) return;
    const job = await waitForJobCompletion(jobId);
    expect(job, 'Job did not complete within timeout').toBeDefined();
    missionIdFromApi = typeof job?.missionId === 'string' ? job.missionId : (job?.missionId?.id ?? job?.missionId);
    const status = (job?.status || '').toLowerCase();
    expect(status, `Expected completed, got ${status}`).toBe('completed');
    jobCompletedSuccessfully = true;
  }, 125_000);

  it('4. Mission.context.missionPlan[jobId].steps — all 4 steps have status completed', async () => {
    if (!BEARER_TOKEN || !jobId || !jobCompletedSuccessfully) return;
    const { ok, status, data } = await apiGet(`/api/mi/orchestra/job/${jobId}/mission-context`);
    expect(ok, `GET mission-context failed: ${status} ${JSON.stringify(data)}`).toBe(true);
    const plan = data?.context?.missionPlan?.[jobId];
    expect(plan, `missionPlan[${jobId}] missing`).toBeDefined();
    const steps = plan?.steps;
    expect(Array.isArray(steps), 'missionPlan.steps must be an array').toBe(true);
    expect(steps.length, 'Expected 4 steps').toBe(4);
    for (const stepId of EXPECTED_STEP_IDS) {
      const step = steps.find((s) => s?.stepId === stepId);
      expect(step, `Step ${stepId} not found`).toBeDefined();
      expect((step?.status || '').toLowerCase(), `Step ${stepId} should be completed`).toBe('completed');
    }
  });

  it('5. No step has status pending (every step was reported)', async () => {
    if (!BEARER_TOKEN || !jobId || !jobCompletedSuccessfully) return;
    const { ok, data } = await apiGet(`/api/mi/orchestra/job/${jobId}/mission-context`);
    expect(ok).toBe(true);
    const steps = data?.context?.missionPlan?.[jobId]?.steps ?? [];
    const pending = steps.filter((s) => (s?.status || '').toLowerCase() === 'pending');
    expect(pending.length, `Expected no pending steps, found: ${pending.map((s) => s?.stepId).join(', ')}`).toBe(0);
  });

  it('6. MissionEvent stream contains step_started for each stepId (research, catalog, media, copy)', async () => {
    if (!jobId || !jobCompletedSuccessfully) return;
    const missionId = missionIdFromApi ?? (await getPrismaClient().orchestratorTask.findUnique({
      where: { id: jobId },
      select: { missionId: true },
    }))?.missionId;
    expect(missionId, 'missionId required').toBeDefined();
    const prisma = getPrismaClient();
    expect(prisma?.missionEvent).toBeDefined();
    const events = await prisma.missionEvent.findMany({
      where: { missionId, type: 'step_started' },
      orderBy: { createdAt: 'asc' },
    });
    for (const stepId of EXPECTED_STEP_IDS) {
      const forStep = events.find((e) => e?.payload && (e.payload.stepId === stepId || (typeof e.payload === 'object' && e.payload.stepId === stepId)));
      expect(forStep, `step_started event for stepId ${stepId} not found`).toBeDefined();
    }
  });

  it('7. MissionEvent stream contains step_completed for each stepId', async () => {
    if (!jobId || !jobCompletedSuccessfully) return;
    const missionId = missionIdFromApi ?? (await getPrismaClient().orchestratorTask.findUnique({
      where: { id: jobId },
      select: { missionId: true },
    }))?.missionId;
    expect(missionId).toBeDefined();
    const prisma = getPrismaClient();
    for (const stepId of EXPECTED_STEP_IDS) {
      const events = await prisma.missionEvent.findMany({
        where: { missionId, type: 'step_completed' },
        orderBy: { createdAt: 'asc' },
      });
      const forStep = events.find((e) => e?.payload && (e.payload.stepId === stepId || (typeof e.payload === 'object' && e.payload.stepId === stepId)));
      expect(forStep, `step_completed event for stepId ${stepId} not found`).toBeDefined();
    }
  });

  it('8. MissionEvent stream contains step_checkpoint for stepId copy', async () => {
    if (!jobId || !jobCompletedSuccessfully) return;
    const missionId = missionIdFromApi ?? (await getPrismaClient().orchestratorTask.findUnique({
      where: { id: jobId },
      select: { missionId: true },
    }))?.missionId;
    expect(missionId).toBeDefined();
    const prisma = getPrismaClient();
    const events = await prisma.missionEvent.findMany({
      where: { missionId, type: 'step_checkpoint' },
      orderBy: { createdAt: 'asc' },
    });
    const copyCheckpoint = events.find((e) => e?.payload && (e.payload.stepId === 'copy' || (typeof e.payload === 'object' && e.payload.stepId === 'copy')));
    expect(copyCheckpoint, 'step_checkpoint event for stepId copy not found').toBeDefined();
  });
});
