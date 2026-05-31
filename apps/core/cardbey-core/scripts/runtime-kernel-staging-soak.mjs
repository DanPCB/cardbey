/**
 * Runtime Kernel staging soak — validates phased flag enablement (Foundation → Phase E).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/runtime-kernel-staging-soak.mjs
 *
 * Optional env:
 *   API_BASE=http://localhost:3001
 *   EXPECTED_RUNTIME_KERNEL_STAGE=PHASE_B|PHASE_C|PHASE_D|PHASE_E|FOUNDATION
 *   SOAK_USER_ID=... SOAK_STORE_ID=... (or run ensure-soak-fixture.mjs first)
 *   RUNTIME_KERNEL_SOAK_USE_MOCK=false  — set true to skip real tool dispatch (capabilities-only mode)
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/lib/prisma.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../../..', '.env') });
loadEnv({ path: resolve(root, '.env'), override: true });

const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const USER_ID = process.env.SOAK_USER_ID || process.env.STAGE_A_USER_ID || '';
const STORE_ID = process.env.SOAK_STORE_ID || process.env.STAGE_A_STORE_ID || '';
const EXPECTED_STAGE = (process.env.EXPECTED_RUNTIME_KERNEL_STAGE || '').trim().toUpperCase();
const CAPABILITIES_ONLY = process.env.RUNTIME_KERNEL_SOAK_USE_MOCK === 'true';

const PROACTIVE_PLAN = [
  { step: 1, title: 'Analyze store', recommendedTool: 'analyze_store', parameters: {} },
  { step: 2, title: 'Create promotion', recommendedTool: 'create_promotion', parameters: {} },
];

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

const AUTH = process.env.SOAK_AUTH_TOKEN || (USER_ID ? signToken(USER_ID) : '');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function jfetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {
    ...(auth && AUTH ? { Authorization: `Bearer ${AUTH}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function ok(name, detail) {
  console.log(`[runtime-kernel-soak] ✅ ${name}`, detail ?? '');
}
function fail(name, detail) {
  console.log(`[runtime-kernel-soak] ❌ ${name}`, detail ?? '');
}
function warn(name, detail) {
  console.log(`[runtime-kernel-soak] ⚠️  ${name}`, detail ?? '');
}

async function getRuntimeCapabilities() {
  const res = await jfetch('/api/runtime/capabilities', { auth: false });
  if (res.status !== 200) return null;
  return res.json;
}

async function getRuntimeAuthority() {
  const res = await jfetch('/api/broker/runtime-authority', { auth: false });
  if (res.status !== 200 || !res.json?.ok) return null;
  return res.json;
}

function metricDelta(after, before) {
  const out = {};
  for (const k of Object.keys(after || {})) {
    if (typeof after?.[k] === 'number' && typeof before?.[k] === 'number') {
      out[k] = after[k] - before[k];
    }
  }
  return out;
}

async function createProactiveMissionFixture() {
  if (!USER_ID || !STORE_ID) {
    throw new Error('SOAK_USER_ID and SOAK_STORE_ID required (run: node scripts/ensure-soak-fixture.mjs)');
  }
  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.create({
    data: {
      type: 'launch_campaign',
      title: 'Runtime Kernel soak: proactive plan',
      status: 'executing',
      runState: 'idle',
      targetType: 'store',
      targetId: STORE_ID,
      executionMode: 'GUIDED_RUN',
      requiresConfirmation: false,
      createdBy: USER_ID,
      tenantId: USER_ID,
      metadataJson: {
        storeId: STORE_ID,
        proactivePlanSteps: PROACTIVE_PLAN,
      },
    },
  });
  return mission.id;
}

async function deleteMissionFixture(missionId) {
  try {
    const prisma = getPrismaClient();
    await prisma.missionPipeline.delete({ where: { id: missionId } });
  } catch {
    // best-effort cleanup
  }
}

async function runOrchestratorProbe(missionId) {
  const runNext = await jfetch(`/api/runtime/missions/${missionId}/run-next`, {
    method: 'POST',
    body: { source: 'runtime_kernel_soak', maxSteps: 1 },
  });

  if (runNext.status === 503 && runNext.json?.code === 'RUNTIME_CAPABILITY_UNAVAILABLE') {
    return { ok: 'skipped', reason: 'orchestrator_disabled', runNext };
  }

  const acceptable =
    (runNext.status === 200 && runNext.json?.ok !== false) ||
    runNext.status === 412 ||
    runNext.json?.code === 'PREREQUISITE_REQUIRED' ||
    runNext.json?.code === 'READINESS_BLOCKED';

  if (!acceptable) {
    return { ok: false, runNext };
  }

  await sleep(200);

  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { metadataJson: true },
  });
  const meta = row?.metadataJson ?? {};

  return {
    ok: true,
    runNext,
    orchestrationMode: runNext.json?.orchestrationMode ?? null,
    metadata: meta,
    hasGraph: Boolean(meta.runtimeMissionGraph),
    hasWorkerState: Boolean(meta.runtimeWorkerState),
    hasQueue: Boolean(meta.runtimeExecutionQueue),
    queueItems: meta.runtimeExecutionQueue?.items?.length ?? 0,
  };
}

function assertStageExpectations(rollout, probe) {
  const stage = rollout?.rolloutStage ?? 'OFF';
  const warnings = [];

  if (stage === 'OFF') {
    warnings.push('Runtime Kernel foundation not enabled');
  }
  if (['PHASE_C', 'PHASE_D', 'PHASE_E'].includes(stage) && probe?.ok === true && !probe.hasGraph) {
    warnings.push('Expected runtimeMissionGraph in metadata after run-next');
  }
  if (['PHASE_D', 'PHASE_E'].includes(stage) && probe?.ok === true && !probe.hasWorkerState) {
    warnings.push('Expected runtimeWorkerState after skill runtime execution');
  }
  if (stage === 'PHASE_E' && probe?.ok === true && probe.queueItems === 0) {
    warnings.push('Expected runtimeExecutionQueue items after durable execution');
  }

  return warnings;
}

async function main() {
  console.log('[runtime-kernel-soak] API', API_BASE);
  console.log('[runtime-kernel-soak] Store', STORE_ID || '(unset)');
  console.log('[runtime-kernel-soak] User', USER_ID || '(unset)');

  const beforeAuthority = await getRuntimeAuthority();

  const caps = await getRuntimeCapabilities();
  if (!caps?.ok) {
    fail('runtime capabilities', caps);
    process.exitCode = 1;
    return;
  }

  const rollout = caps.runtimeKernelRollout ?? {};
  ok('runtime capabilities', {
    rolloutStage: rollout.rolloutStage,
    phaseB: rollout.phaseFlags?.phaseB,
    phaseC: rollout.phaseFlags?.phaseC,
    phaseD: rollout.phaseFlags?.phaseD,
    phaseE: rollout.phaseFlags?.phaseE,
  });

  if (EXPECTED_STAGE && rollout.rolloutStage !== EXPECTED_STAGE) {
    fail('expected rollout stage', { expected: EXPECTED_STAGE, actual: rollout.rolloutStage });
    process.exitCode = 1;
    return;
  }

  if (rollout.recommendations?.nextStage) {
    warn('next staging phase', {
      next: rollout.recommendations.nextStage,
      enable: rollout.recommendations.enableEnv,
    });
  }

  let missionId = null;
  let probe = { ok: 'skipped', reason: 'capabilities_only' };

  if (!CAPABILITIES_ONLY && rollout.rolloutStage !== 'OFF' && rollout.phaseFlags?.phaseB) {
    missionId = await createProactiveMissionFixture();
    ok('proactive mission fixture', { missionId });
    probe = await runOrchestratorProbe(missionId);
    if (probe.ok === false) {
      fail('orchestrator run-next', probe.runNext?.json ?? probe);
    } else if (probe.ok === 'skipped') {
      warn('orchestrator run-next (skipped)', probe.reason);
    } else {
      ok('orchestrator run-next', {
        orchestrationMode: probe.orchestrationMode,
        code: probe.runNext?.json?.code,
        hasGraph: probe.hasGraph,
        hasWorkerState: probe.hasWorkerState,
        queueItems: probe.queueItems,
      });
    }

    const stageWarnings = assertStageExpectations(rollout, probe);
    for (const w of stageWarnings) {
      warn('stage expectation', w);
    }
  } else if (CAPABILITIES_ONLY) {
    warn('orchestrator probe skipped', 'RUNTIME_KERNEL_SOAK_USE_MOCK=true');
  } else {
    warn('orchestrator probe skipped', 'Phase B not enabled or foundation missing');
  }

  await sleep(150);
  const afterAuthority = await getRuntimeAuthority();
  if (beforeAuthority && afterAuthority) {
    const delta = metricDelta(afterAuthority.metrics, beforeAuthority.metrics);
    console.log('[runtime-kernel-soak] authority metrics(delta)', delta);
    const bad = ['orphanWarnings', 'ownershipBlocks', 'duplicationWarnings', 'bypassDirectDispatch'].filter(
      (k) => (delta[k] ?? 0) !== 0,
    );
    if (bad.length > 0) {
      fail('runtime authority metric regression', bad.map((k) => ({ metric: k, delta: delta[k] })));
      process.exitCode = 1;
    } else {
      ok('runtime authority metrics clean', delta);
    }
  }

  if (missionId) {
    await deleteMissionFixture(missionId);
  }

  if (process.exitCode === 1) return;
  console.log('[runtime-kernel-soak] PASS', { rolloutStage: rollout.rolloutStage });
}

main().catch((err) => {
  console.error('[runtime-kernel-soak] fatal', err);
  process.exitCode = 1;
});
