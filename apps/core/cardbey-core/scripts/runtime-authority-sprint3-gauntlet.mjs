/**
 * Runtime Authority Sprint 3 gauntlet — final gate validation.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/runtime-authority-sprint3-gauntlet.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dashboardRoot = resolve(root, '../../dashboard/cardbey-marketing-dashboard');
loadEnv({ path: resolve(root, '../../..', '.env') });
loadEnv({ path: resolve(root, '.env'), override: true });

const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');

function pass(name, detail) {
  console.log(`[sprint3-gauntlet] PASS ${name}`, detail ?? '');
}
function fail(name, detail) {
  console.log(`[sprint3-gauntlet] FAIL ${name}`, detail ?? '');
}
function warn(name, detail) {
  console.log(`[sprint3-gauntlet] WARN ${name}`, detail ?? '');
}

function readSrc(relPath) {
  const abs = resolve(root, 'src', relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function readDashboard(relPath) {
  const abs = resolve(dashboardRoot, 'src', relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function staticChecks() {
  let ok = true;

  const publishModal = readDashboard('components/publish/PublishModal.tsx');
  if (publishModal.includes('executeUiAction') && !publishModal.includes("'/mini-website/publish/cardbey'")) {
    pass('publish_modal', 'routes through ui-action');
  } else {
    fail('publish_modal', 'still calls direct mini-website publish');
    ok = false;
  }

  const storeReview = readDashboard('features/storeDraft/StoreDraftReview.tsx');
  if (storeReview.includes('patchHeroToDraft') && !storeReview.includes('apiPATCH(`/stores/${effectiveStoreId}/draft/hero')) {
    pass('store_draft_review_hero', 'uses runtime hero persist');
  } else {
    fail('store_draft_review_hero', 'direct hero PATCH may remain');
    ok = false;
  }

  const manualFooter = readDashboard('features/contents-studio/components/ManualModeFooter.tsx');
  if (manualFooter.includes('renderCreativeAssetViaRuntime')) {
    pass('content_studio_render', 'runtime-backed render');
  } else {
    fail('content_studio_render', 'direct video/render call');
    ok = false;
  }

  const exploreApi = readDashboard('lib/explore/exploreVideosApi.ts');
  if (exploreApi.includes('buildUiRuntimeAuthorityHeaders')) {
    pass('explore_writes', 'runtime authority on explore API');
  } else {
    fail('explore_writes', 'explore API missing authority');
    ok = false;
  }

  const intakeV1 = readSrc('routes/performerIntakeRoutes.js');
  if (
    intakeV1.includes('performerIntakeV2Routes') &&
    intakeV1.includes('applyIntakeV1DeprecationHeaders')
  ) {
    pass('intake_v1', 'v1 shim forwards to v2 with deprecation headers');
  } else {
    fail('intake_v1', 'intake v1 shim missing or legacy implementation restored');
    ok = false;
  }

  const mcp = readSrc('routes/mcpServerRoutes.js');
  if (mcp.includes('mcp_facade') && !mcp.includes('dr = await dispatchTool(internalTool')) {
    pass('mcp_dispatch', 'always routes via facade');
  } else {
    fail('mcp_dispatch', 'direct dispatchTool may remain');
    ok = false;
  }

  const contents = readSrc('routes/contents.js');
  if (contents.includes("router.post('/video/render'") && contents.includes('assertUiWriteAuthority')) {
    pass('contents_video_render', 'guarded render route');
  } else {
    fail('contents_video_render', 'render route missing guard');
    ok = false;
  }

  const uiActions = readSrc('lib/runtime/performerRuntime/uiRuntimeActionService.js');
  if (uiActions.includes('render_creative_asset') && uiActions.includes('publish_cardbey')) {
    pass('ui_runtime_actions_s3', 'sprint 3 actions present');
  } else {
    fail('ui_runtime_actions_s3', 'missing sprint 3 actions');
    ok = false;
  }

  const e2e = resolve(dashboardRoot, 'tests/e2e/runtime-authority-gauntlet.spec.ts');
  if (existsSync(e2e)) {
    pass('e2e_gauntlet', 'playwright spec present');
  } else {
    fail('e2e_gauntlet', 'playwright spec missing');
    ok = false;
  }

  const gateReport = resolve(root, '../../../docs/FACTORY_RUNTIME_V1_GATE_REPORT.md');
  if (existsSync(gateReport)) {
    pass('gate_report', 'FACTORY_RUNTIME_V1_GATE_REPORT.md present');
  } else {
    fail('gate_report', 'gate report missing');
    ok = false;
  }

  return ok;
}

async function inProcessChecks() {
  const { guardPhaseFIntakeV1Dispatch } = await import('../src/lib/broker/phaseFBypassGuards.js');
  const guard = guardPhaseFIntakeV1Dispatch({ missionId: 'm-s3', userId: 'u-s3', toolName: 'test' });
  if (!guard.useFacade) {
    fail('intake_v1_guard', 'facade not default');
    return false;
  }
  pass('intake_v1_guard', { useFacade: guard.useFacade, blocked: guard.blocked });
  return true;
}

async function main() {
  console.log('[sprint3-gauntlet] Sprint 3 Final Gate Gauntlet');
  const staticOk = staticChecks();
  const inProcessOk = await inProcessChecks();

  if (staticOk && inProcessOk) {
    console.log('[sprint3-gauntlet] OVERALL PASS');
    process.exit(0);
  }
  console.log('[sprint3-gauntlet] OVERALL FAIL');
  process.exit(1);
}

main().catch((err) => {
  console.error('[sprint3-gauntlet] FATAL', err);
  process.exit(1);
});
