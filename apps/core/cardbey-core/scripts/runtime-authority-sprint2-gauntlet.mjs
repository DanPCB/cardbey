/**
 * Runtime Authority Sprint 2 gauntlet — UI write + artifact authority validation.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/runtime-authority-sprint2-gauntlet.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../../..', '.env') });
loadEnv({ path: resolve(root, '.env'), override: true });

const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');

const SPRINT2_SCENARIOS = [
  { id: 'hero_patch', action: 'update_hero_artifact', source: 'ui_hero_patch' },
  { id: 'publish_store', action: 'publish_store', source: 'ui_publish' },
  { id: 'hero_upload', mutationType: 'hero_upload', source: 'ui_hero_upload' },
  { id: 'signage_publish', action: 'publish_signage', source: 'ui_publish' },
  { id: 'slideshow', artifactType: 'generated_slideshow', source: 'generate_slideshow' },
  { id: 'video', artifactType: 'generated_video', source: 'video_generate_multimodal' },
  { id: 'campaign', action: 'publish_campaign', source: 'ui_publish' },
  { id: 'approval_checkpoint', tool: 'video_plan', source: 'skill_router' },
  { id: 'resume_mission', tool: 'video_execute', source: 'skill_router' },
];

function pass(name, detail) {
  console.log(`[sprint2-gauntlet] PASS ${name}`, detail ?? '');
}
function fail(name, detail) {
  console.log(`[sprint2-gauntlet] FAIL ${name}`, detail ?? '');
}
function warn(name, detail) {
  console.log(`[sprint2-gauntlet] WARN ${name}`, detail ?? '');
}

function readSrc(relPath) {
  const abs = resolve(root, 'src', relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

async function jfetch(path, opts) {
  const res = await fetch(`${API_BASE}${path}`, opts);
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

  const uiGuard = readSrc('lib/runtime/performerRuntime/uiWriteAuthorityGuard.js');
  const coreGuard = readSrc('lib/runtime/performerRuntime/runtimeAuthorityGuard.js');
  if (
    uiGuard.includes('assertUiWriteAuthority') &&
    uiGuard.includes('recordRuntimeAuthorityPathUsed') &&
    coreGuard.includes('RUNTIME_AUTHORITY_PATH_USED')
  ) {
    pass('ui_write_guard', 'uiWriteAuthorityGuard present');
  } else {
    fail('ui_write_guard', 'uiWriteAuthorityGuard missing');
    ok = false;
  }

  const uiAction = readSrc('lib/runtime/performerRuntime/uiRuntimeActionService.js');
  if (
    uiAction.includes('update_hero_artifact') &&
    uiAction.includes('publish_store') &&
    uiAction.includes('publish_signage')
  ) {
    pass('ui_runtime_actions', 'hero + publish adapters wired');
  } else {
    fail('ui_runtime_actions', 'uiRuntimeActionService incomplete');
    ok = false;
  }

  const routes = readSrc('routes/performerRuntimeRoutes.js');
  if (routes.includes("router.post('/ui-action'")) {
    pass('ui_action_route', 'POST /api/performer/runtime/ui-action registered');
  } else {
    fail('ui_action_route', 'ui-action route missing');
    ok = false;
  }

  const stores = readSrc('routes/stores.js');
  if (stores.includes('assertUiWriteAuthority') && stores.includes('draft/hero')) {
    pass('hero_patch_guard', 'stores hero routes guarded');
  } else {
    fail('hero_patch_guard', 'stores hero guard missing');
    ok = false;
  }

  const artifactAuth = readSrc('lib/artifacts/generatedArtifactAuthority.js');
  if (
    artifactAuth.includes('generated_video') &&
    artifactAuth.includes('generated_slideshow') &&
    artifactAuth.includes('campaign_package')
  ) {
    pass('artifact_authority_v1', 'generated artifact types defined');
  } else {
    fail('artifact_authority_v1', 'generatedArtifactAuthority incomplete');
    ok = false;
  }

  const dashboardClient = resolve(
    root,
    '../../dashboard/cardbey-marketing-dashboard/src/lib/runtime/uiRuntimeClient.ts',
  );
  if (existsSync(dashboardClient)) {
    pass('dashboard_ui_runtime_client', 'uiRuntimeClient.ts present');
  } else {
    fail('dashboard_ui_runtime_client', 'uiRuntimeClient.ts missing');
    ok = false;
  }

  const maintenance = readSrc('lib/intake/buildMaintenanceContext.js');
  if (maintenance.includes('runtimeOwned: true')) {
    pass('maintenance_dispatch', 'maintenance context runtime-owned');
  } else {
    fail('maintenance_dispatch', 'buildMaintenanceContext not runtime-owned');
    ok = false;
  }

  return ok;
}

async function inProcessChecks() {
  const { resetRuntimeAuthorityMetrics, getRuntimeAuthorityMetrics } = await import(
    '../src/lib/runtime/performerRuntime/runtimeAuthorityStaging.js'
  );
  const { assertUiWriteAuthority } = await import(
    '../src/lib/runtime/performerRuntime/uiWriteAuthorityGuard.js'
  );
  const { createGeneratedArtifactV1 } = await import(
    '../src/lib/artifacts/generatedArtifactAuthority.js'
  );

  resetRuntimeAuthorityMetrics();
  process.env.NODE_ENV = 'test';

  for (const scenario of SPRINT2_SCENARIOS) {
    if (scenario.mutationType) {
      assertUiWriteAuthority(
        { headers: { 'x-cardbey-runtime-authority': '1' }, body: {} },
        {
          mutationType: scenario.mutationType,
          route: `gauntlet/${scenario.id}`,
          missionId: `mission-${scenario.id}`,
          source: scenario.source,
        },
      );
    }
  }

  const artifact = createGeneratedArtifactV1({
    artifactType: 'generated_video',
    missionId: 'mission-video',
    ownerUserId: 'gauntlet-user',
    source: 'gauntlet',
    status: 'ready',
    url: 'https://example.com/v.mp4',
  });
  if (!artifact.artifactId || !artifact.missionId) {
    fail('artifact_record', 'generated artifact record invalid');
    return false;
  }
  pass('artifact_record', { artifactId: artifact.artifactId, type: artifact.artifactType });

  const metrics = getRuntimeAuthorityMetrics();
  if (metrics.runtimeAuthorityBypass > 0) {
    fail('in_process', { runtimeAuthorityBypass: metrics.runtimeAuthorityBypass });
    return false;
  }
  pass('in_process', {
    runtimeAuthorityPathUsed: metrics.runtimeAuthorityPathUsed,
    runtimeAuthorityBypass: metrics.runtimeAuthorityBypass,
  });
  return true;
}

async function apiChecks() {
  try {
    const authority = await jfetch('/api/broker/runtime-authority');
    if (authority.status === 200 && authority.json?.ok) {
      pass('api_snapshot', {
        rolloutStage: authority.json.rolloutStage,
        pathUsed: authority.json.metrics?.runtimeAuthorityPathUsed,
      });
    } else {
      warn('api_snapshot', 'runtime-authority endpoint unavailable (server may be down)');
    }

    const uiActionProbe = await jfetch('/api/performer/runtime/ui-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'update_hero_artifact' }),
    });
    if (uiActionProbe.status === 401) {
      pass('ui_action_auth', 'ui-action requires auth (route live)');
    } else if (uiActionProbe.status === 404) {
      warn('ui_action_auth', 'ui-action route not mounted (server may be down or old build)');
    } else {
      warn('ui_action_auth', { status: uiActionProbe.status });
    }
    return true;
  } catch (err) {
    warn('api_checks', err?.message ?? String(err));
    return true;
  }
}

async function main() {
  console.log('[sprint2-gauntlet] Sprint 2 Runtime Authority Gauntlet');
  console.log('[sprint2-gauntlet] API_BASE=', API_BASE);

  const staticOk = staticChecks();
  const inProcessOk = await inProcessChecks();
  const apiOk = await apiChecks();

  if (staticOk && inProcessOk && apiOk) {
    console.log('[sprint2-gauntlet] OVERALL PASS');
    process.exit(0);
  }

  console.log('[sprint2-gauntlet] OVERALL FAIL');
  process.exit(1);
}

main().catch((err) => {
  console.error('[sprint2-gauntlet] FATAL', err);
  process.exit(1);
});
