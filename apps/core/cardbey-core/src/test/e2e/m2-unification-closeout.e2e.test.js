/**
 * M2 Unification close-out tests.
 * Covers: getUnifiedExecutionPlans (unit) + GET /api/missions/:missionId returns executionPlans (E2E).
 *
 * Unit tests: no server required.
 * E2E tests: require server running with same DATABASE_URL as test.
 *
 * Run:
 *   $env:NODE_ENV="test"; $env:DATABASE_URL="file:./prisma/test.db";
 *   npx vitest run src/test/e2e/m2-unification-closeout.e2e.test.js
 */

import { describe, it, expect } from 'vitest';
import { getUnifiedExecutionPlans } from '../../lib/missionPlan/unifiedPlan.js';

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api/mi';
const API_MISSIONS = process.env.API_MISSIONS_BASE || 'http://localhost:3001/api/missions';
const DEV_TOKEN = process.env.E2E_AUTH_TOKEN || process.env.AUTH_TOKEN || 'dev-admin-token';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isConnectionRefused(err) {
  return (
    err?.code === 'ECONNREFUSED' ||
    err?.cause?.code === 'ECONNREFUSED' ||
    err?.message?.includes('ECONNREFUSED') ||
    err?.message?.includes('fetch failed')
  );
}

async function apiPost(base, path, body) {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEV_TOKEN}` },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  } catch (err) {
    if (isConnectionRefused(err)) throw new Error(`API not reachable at ${base}${path}. Start server first.`);
    throw err;
  }
}

async function apiGet(base, path) {
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${DEV_TOKEN}` },
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  } catch (err) {
    if (isConnectionRefused(err)) throw new Error(`API not reachable at ${base}${path}. Start server first.`);
    throw err;
  }
}

function isValidExecutionPlan(plan) {
  return (
    plan &&
    typeof plan === 'object' &&
    typeof plan.planId === 'string' &&
    typeof plan.intentType === 'string' &&
    typeof plan.intentId === 'string' &&
    'createdAt' in plan &&
    Array.isArray(plan.steps)
  );
}

// ─── Unit tests: getUnifiedExecutionPlans ────────────────────────────────────

describe('M2 Unification close-out', () => {

  describe('Unit — getUnifiedExecutionPlans', () => {

    it('1. returns [] for null/undefined context', () => {
      expect(getUnifiedExecutionPlans(null)).toEqual([]);
      expect(getUnifiedExecutionPlans(undefined)).toEqual([]);
      expect(getUnifiedExecutionPlans({})).toEqual([]);
    });

    it('2. returns orchestra plans from context.missionPlan map', () => {
      const context = {
        missionPlan: {
          'job-1': {
            planId: 'orchestra_job-1',
            intentType: 'build_store',
            intentId: 'job-1',
            createdAt: '2025-01-01T10:00:00.000Z',
            steps: [
              { stepId: 'catalog', order: 1, agentType: 'CatalogAgent', label: 'Building catalogue', dependsOn: [], checkpoint: false, status: 'completed' },
            ],
          },
        },
      };
      const plans = getUnifiedExecutionPlans(context);
      expect(plans.length).toBe(1);
      expect(plans[0].planId).toBe('orchestra_job-1');
      expect(plans[0].intentType).toBe('build_store');
      expect(plans[0].steps.length).toBe(1);
    });

    it('3. returns chain plan adapted via chainPlanToExecutionPlan', () => {
      const context = {
        chainPlan: {
          chainId: 'chain-abc',
          mode: 'manual',
          cursor: 0,
          status: 'running',
          createdFromMessageId: 'msg-1',
          suggestions: [
            { id: 's1', agentKey: 'catalog', intent: 'Build catalogue', risk: 'R0', requiresApproval: false },
            { id: 's2', agentKey: 'copy', intent: 'Write descriptions', risk: 'R1', requiresApproval: true },
          ],
        },
      };
      const plans = getUnifiedExecutionPlans(context);
      expect(plans.length).toBe(1);
      expect(plans[0].planId).toBe('chain_chain-abc');
      expect(plans[0].intentType).toBe('chain_plan');
      expect(plans[0].steps.length).toBe(2);
    });

    it('4. returns both orchestra and chain plans when both present — sorted most recent first', () => {
      const context = {
        missionPlan: {
          'job-old': {
            planId: 'orchestra_job-old',
            intentType: 'build_store',
            intentId: 'job-old',
            createdAt: '2025-01-01T08:00:00.000Z',
            steps: [{ stepId: 'catalog', order: 1, agentType: 'CatalogAgent', label: 'Catalogue', dependsOn: [], checkpoint: false, status: 'completed' }],
          },
          'job-new': {
            planId: 'orchestra_job-new',
            intentType: 'build_store',
            intentId: 'job-new',
            createdAt: '2025-01-02T10:00:00.000Z',
            steps: [{ stepId: 'catalog', order: 1, agentType: 'CatalogAgent', label: 'Catalogue', dependsOn: [], checkpoint: false, status: 'pending' }],
          },
        },
        chainPlan: {
          chainId: 'chain-xyz',
          mode: 'manual',
          cursor: 0,
          createdFromMessageId: 'msg-1',
          suggestions: [
            { id: 's1', agentKey: 'planner', intent: 'Plan store', risk: 'R0', requiresApproval: false },
          ],
        },
      };
      const plans = getUnifiedExecutionPlans(context);
      expect(plans.length).toBe(3);
      // Most recent orchestra plan first (chain plan has empty createdAt so sorts last)
      expect(plans[0].planId).toBe('orchestra_job-new');
      expect(plans[1].planId).toBe('orchestra_job-old');
      expect(plans[2].planId).toBe('chain_chain-xyz');
    });

    it('5. every plan in the array is a valid ExecutionMissionPlan shape', () => {
      const context = {
        missionPlan: {
          'job-1': {
            planId: 'orchestra_job-1',
            intentType: 'build_store',
            intentId: 'job-1',
            createdAt: '2025-01-01T10:00:00.000Z',
            steps: [],
          },
        },
        chainPlan: {
          chainId: 'chain-1',
          mode: 'manual',
          cursor: 0,
          createdFromMessageId: 'msg-1',
          suggestions: [
            { id: 's1', agentKey: 'catalog', intent: 'Build', risk: 'R0', requiresApproval: false },
          ],
        },
      };
      const plans = getUnifiedExecutionPlans(context);
      for (const plan of plans) {
        expect(
          isValidExecutionPlan(plan),
          `Plan is missing required fields: ${JSON.stringify(plan)}`
        ).toBe(true);
      }
    });

    it('6. chain plan with requiresApproval:true has checkpoint:true on that step', () => {
      const context = {
        chainPlan: {
          chainId: 'chain-1',
          mode: 'manual',
          cursor: 0,
          createdFromMessageId: 'msg-1',
          suggestions: [
            { id: 's1', agentKey: 'catalog', intent: 'Build catalogue', risk: 'R0', requiresApproval: false },
            { id: 's2', agentKey: 'copy', intent: 'Write copy', risk: 'R2', requiresApproval: true },
          ],
        },
      };
      const plans = getUnifiedExecutionPlans(context);
      expect(plans.length).toBe(1);
      const steps = plans[0].steps;
      expect(steps[0].checkpoint).toBe(false);
      expect(steps[1].checkpoint).toBe(true);
    });

    it('7. skips malformed missionPlan entries (no steps array)', () => {
      const context = {
        missionPlan: {
          'good-job': {
            planId: 'orchestra_good-job',
            intentType: 'build_store',
            intentId: 'good-job',
            createdAt: '2025-01-01T10:00:00.000Z',
            steps: [],
          },
          'bad-job': { planId: 'bad', intentType: 'x' }, // missing steps array
          'null-job': null,
        },
      };
      const plans = getUnifiedExecutionPlans(context);
      expect(plans.length).toBe(1);
      expect(plans[0].planId).toBe('orchestra_good-job');
    });
  });

  // ─── E2E tests: API response ────────────────────────────────────────────────

  describe('E2E — GET /api/missions/:missionId returns executionPlans', () => {
    let missionId = null;
    let jobId = null;

    it('8. Start orchestra job and get missionId', async () => {
      const { ok, status, data } = await apiPost(API_BASE, '/orchestra/start', {
        goal: 'build_store',
        businessName: 'M2 Test Store',
        businessType: '(empty)',
      });
      expect(ok, `POST /orchestra/start failed: ${status} ${JSON.stringify(data)}`).toBe(true);
      expect(data?.jobId).toBeDefined();
      jobId = data.jobId;

      // Run the job; /run handler creates Mission with id = jobId and sets task.missionId = jobId
      await apiPost(API_BASE, `/orchestra/job/${jobId}/run`, {});

      // For orchestra jobs, missionId is jobId (Mission row created with id = jobId in /run).
      // Use API to get missionId so we don't depend on test process and server sharing the same DB.
      await new Promise((r) => setTimeout(r, 500));
      const { ok: jobOk, data: jobData } = await apiGet(API_BASE, `/orchestra/job/${jobId}`);
      expect(jobOk, `GET /orchestra/job/${jobId} failed`).toBe(true);
      missionId = jobData?.missionId ?? jobId;
      expect(missionId).toBeDefined();
    }, 45000);

    it('9. GET /api/missions/:missionId returns executionPlans array', async () => {
      if (!missionId) return;
      const { ok, status, data } = await apiGet(API_MISSIONS, `/${missionId}`);
      expect(ok, `GET /missions/${missionId} failed: ${status} ${JSON.stringify(data)}`).toBe(true);
      expect(
        Array.isArray(data?.executionPlans),
        `executionPlans should be an array, got: ${JSON.stringify(data?.executionPlans)}`
      ).toBe(true);
    });

    it('10. executionPlans contains orchestra plan with 4 steps after build_store run', async () => {
      if (!missionId) return;

      // Wait for plan to be written and job to complete
      const { getPrismaClient } = await import('../../lib/prisma.js');
      const prisma = getPrismaClient();
      let plans = [];
      for (let i = 0; i < 30; i++) {
        const { data } = await apiGet(API_MISSIONS, `/${missionId}`);
        plans = data?.executionPlans ?? [];
        const orchPlan = plans.find((p) => p.intentType === 'build_store' || p.planId?.startsWith('orchestra_'));
        if (orchPlan?.steps?.length === 4) break;
        await new Promise((r) => setTimeout(r, 400));
      }

      const orchPlan = plans.find((p) => p.intentType === 'build_store' || p.planId?.startsWith('orchestra_'));
      expect(orchPlan, 'No build_store orchestra plan found in executionPlans').toBeDefined();
      expect(orchPlan.steps.length, 'Orchestra plan should have 4 steps').toBe(4);

      // Verify step ids
      const stepIds = orchPlan.steps.map((s) => s.stepId);
      expect(stepIds).toContain('research');
      expect(stepIds).toContain('catalog');
      expect(stepIds).toContain('media');
      expect(stepIds).toContain('copy');

      // All steps should be valid ExecutionPlanStep shape
      for (const step of orchPlan.steps) {
        expect(typeof step.stepId).toBe('string');
        expect(typeof step.order).toBe('number');
        expect(typeof step.agentType).toBe('string');
        expect(typeof step.label).toBe('string');
        expect(Array.isArray(step.dependsOn)).toBe(true);
        expect(typeof step.checkpoint).toBe('boolean');
        expect(typeof step.status).toBe('string');
      }
    }, 25000);

    it('11. executionPlans is always present and is an array even for mission with no plans', async () => {
      // Contract: GET /api/missions/:missionId always returns executionPlans as an array (possibly empty).
      // Use missionId from test 8; skip if test 8 did not set it (e.g. timeout).
      if (!missionId) return;
      const { ok, data } = await apiGet(API_MISSIONS, `/${missionId}`);
      expect(ok).toBe(true);
      expect(Array.isArray(data?.executionPlans)).toBe(true);
      for (const plan of data.executionPlans) {
        expect(isValidExecutionPlan(plan), `Invalid plan shape: ${JSON.stringify(plan)}`).toBe(true);
      }
    }, 15000);
  });

  // Production-critical: ensure /api/mi and /api/draft-store are mounted (avoid 404 from Express when route missing)
  describe('Production-critical route mounts', () => {
    it('GET /api/mi/missions/:id/events is mounted (returns 401 or 200, not 404)', async () => {
      const base = process.env.API_BASE || 'http://localhost:3001/api/mi';
      const res = await fetch(`${base}/missions/test-mission-id/events?limit=10`, {
        headers: { Authorization: 'Bearer invalid-token' },
      }).catch((e) => {
        if (e?.code === 'ECONNREFUSED') throw new Error('API not reachable. Start server with ROLE=api.');
        throw e;
      });
      // Route must be hit: 401 (unauthorized) or 200 (if test token valid). 404 = route not mounted.
      expect(res.status, 'GET /api/mi/missions/:id/events should be mounted (401 or 200, not 404). Redeploy if 404.').not.toBe(404);
    });

    it('GET /api/draft-store/:id/summary is mounted (returns 401, 403, or handler 404 with ok:false, not Express 404)', async () => {
      const origin = process.env.API_ORIGIN || 'http://localhost:3001';
      const res = await fetch(`${origin}/api/draft-store/fake-draft-id-123/summary`, {
        headers: { Authorization: `Bearer ${DEV_TOKEN}` },
      }).catch((e) => {
        if (e?.code === 'ECONNREFUSED') throw new Error('API not reachable. Start server with ROLE=api.');
        throw e;
      });
      const data = await res.json();
      // If route not mounted, Express returns 404 with { error: 'Not found' }. Handler returns 404 with { ok: false, error: 'not_found' }.
      const isExpress404 = res.status === 404 && data?.error === 'Not found' && data?.ok === undefined;
      expect(isExpress404, 'GET /api/draft-store/:id/summary should be mounted (not Express 404). Redeploy if 404 with { error: "Not found" }.').toBe(false);
    });
  });
});