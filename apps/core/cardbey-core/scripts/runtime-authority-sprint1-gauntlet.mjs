/**
 * Runtime Authority Sprint 1 gauntlet — static + in-process validation.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/runtime-authority-sprint1-gauntlet.mjs
 *
 * Optional env:
 *   API_BASE=http://localhost:3001
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../../..', '.env') });
loadEnv({ path: resolve(root, '.env'), override: true });

const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');

const SCENARIOS = [
  { id: 'create_video', tool: 'queue_video_generation', source: 'intake_v2' },
  { id: 'create_store', tool: 'create_store', source: 'intake_v2' },
  { id: 'launch_campaign', tool: 'launch_campaign', source: 'skill_router' },
  { id: 'generate_slideshow', tool: 'generate_slideshow', source: 'intake_v2' },
  { id: 'dashboard_start', tool: 'orchestra_start', source: 'orchestra_start' },
  { id: 'approval_checkpoint', tool: 'video_plan', source: 'skill_router' },
  { id: 'resume_after_approval', tool: 'video_execute', source: 'skill_router' },
];

function pass(name, detail) {
  console.log(`[sprint1-gauntlet] PASS ${name}`, detail ?? '');
}
function fail(name, detail) {
  console.log(`[sprint1-gauntlet] FAIL ${name}`, detail ?? '');
}
function warn(name, detail) {
  console.log(`[sprint1-gauntlet] WARN ${name}`, detail ?? '');
}

function readSrc(relPath) {
  const abs = resolve(root, 'src', relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

async function jfetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function staticChecks() {
  let ok = true;

  const intake = readSrc('routes/performerIntakeV2Routes.js');
  if (intake.includes('dispatchTool(tool, payload, toolCtx)')) {
    fail('intake_v2', 'direct dispatchTool fallback still present');
    ok = false;
  } else if (intake.includes('performerRuntime.execute') && intake.includes("source: 'intake_v2'")) {
    pass('intake_v2', 'tool fallback routes through performerRuntime');
  } else {
    fail('intake_v2', 'performerRuntime intake wiring not found');
    ok = false;
  }

  const skillRouter = readSrc('lib/skills/SkillRouter.js');
  if (skillRouter.includes('this.skillExecutor.execute(skillDef, ctx)')) {
    fail('skill_router', 'direct SkillExecutor.execute bypass still present');
    ok = false;
  } else if (skillRouter.includes("actionType: 'run_skill'")) {
    pass('skill_router', 'routes through executeRuntimeAction run_skill');
  } else {
    fail('skill_router', 'run_skill runtime path not found');
    ok = false;
  }

  const toolDispatcher = readSrc('lib/toolDispatcher.js');
  if (toolDispatcher.includes('assertRuntimeAuthorityContext')) {
    pass('dispatch_tool_guard', 'RuntimeAuthorityGuard wired');
  } else {
    fail('dispatch_tool_guard', 'assertRuntimeAuthorityContext missing');
    ok = false;
  }

  const orchestraAdapter = readSrc('lib/runtime/performerRuntime/orchestraRuntimeAdapter.js');
  const miRoutes = readSrc('routes/miRoutes.js');
  if (
    orchestraAdapter.includes('routeOrchestraStartViaPerformerRuntime') &&
    miRoutes.includes('routeOrchestraStartViaPerformerRuntime')
  ) {
    pass('orchestra_start', 'POST /api/mi/orchestra/start wrapped by runtime adapter');
  } else {
    fail('orchestra_start', 'orchestra runtime adapter not wired');
    ok = false;
  }

  const guard = readSrc('lib/runtime/performerRuntime/runtimeAuthorityGuard.js');
  if (guard.includes('RUNTIME_AUTHORITY_PATH_USED') && guard.includes('RUNTIME_AUTHORITY_BYPASS')) {
    pass('telemetry_contract', 'path_used + bypass events defined');
  } else {
    fail('telemetry_contract', 'guard telemetry events missing');
    ok = false;
  }

  return ok;
}

async function inProcessChecks() {
  const { resetRuntimeAuthorityMetrics, getRuntimeAuthorityMetrics } = await import(
    '../src/lib/runtime/performerRuntime/runtimeAuthorityStaging.js'
  );
  const { assertRuntimeAuthorityContext } = await import(
    '../src/lib/runtime/performerRuntime/runtimeAuthorityGuard.js'
  );

  resetRuntimeAuthorityMetrics();
  process.env.NODE_ENV = 'test';

  for (const scenario of SCENARIOS) {
    assertRuntimeAuthorityContext(
      { runtimeOwned: true, userId: 'gauntlet-user', missionId: `mission-${scenario.id}` },
      {
        toolName: scenario.tool,
        source: scenario.source,
        route: scenario.source,
        missionId: `mission-${scenario.id}`,
      },
    );
  }

  const metrics = getRuntimeAuthorityMetrics();
  if (metrics.runtimeAuthorityBypass > 0) {
    fail('in_process', { runtimeAuthorityBypass: metrics.runtimeAuthorityBypass });
    return false;
  }
  if (metrics.runtimeAuthorityPathUsed < SCENARIOS.length) {
    fail('in_process', {
      expected: SCENARIOS.length,
      runtimeAuthorityPathUsed: metrics.runtimeAuthorityPathUsed,
    });
    return false;
  }

  pass('in_process', {
    scenarios: SCENARIOS.length,
    runtimeAuthorityPathUsed: metrics.runtimeAuthorityPathUsed,
    runtimeAuthorityBypass: metrics.runtimeAuthorityBypass,
  });
  return true;
}

async function apiChecks() {
  try {
    const authority = await jfetch('/api/broker/runtime-authority');
    if (authority.status !== 200 || !authority.json?.ok) {
      warn('api_snapshot', 'runtime-authority endpoint unavailable (server may be down)');
      return true;
    }
    pass('api_snapshot', {
      rolloutStage: authority.json.rolloutStage,
      metrics: authority.json.metrics,
    });
    return true;
  } catch (err) {
    warn('api_snapshot', err?.message ?? String(err));
    return true;
  }
}

async function main() {
  console.log('[sprint1-gauntlet] Sprint 1 Runtime Authority Gauntlet');
  console.log('[sprint1-gauntlet] API_BASE=', API_BASE);

  const staticOk = staticChecks();
  const inProcessOk = await inProcessChecks();
  await apiChecks();

  if (staticOk && inProcessOk) {
    console.log('[sprint1-gauntlet] OVERALL PASS');
    process.exit(0);
  }

  console.log('[sprint1-gauntlet] OVERALL FAIL');
  process.exit(1);
}

main().catch((err) => {
  console.error('[sprint1-gauntlet] FATAL', err);
  process.exit(1);
});
