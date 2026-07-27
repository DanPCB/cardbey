/**
 * Factory Runtime Reusability Gauntlet — validates P0/P1 hardening sprint.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/factory-runtime-reusability-gauntlet.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../../..', '.env') });
loadEnv({ path: resolve(root, '.env'), override: true });

function pass(name, detail) {
  console.log(`[factory-reusability-gauntlet] PASS ${name}`, detail ?? '');
}
function fail(name, detail) {
  console.log(`[factory-reusability-gauntlet] FAIL ${name}`, detail ?? '');
}

function readSrc(relPath) {
  const abs = resolve(root, 'src', relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function staticChecks() {
  let ok = true;

  const executor = readSrc('lib/factoryRuntime/factoryRuntimeExecutor.js');
  if (!executor.includes('creativeFactoryV2Stages')) {
    pass('executor_decoupled', 'no creativeFactoryV2Stages import');
  } else {
    fail('executor_decoupled', 'still imports creativeFactoryV2Stages');
    ok = false;
  }

  if (executor.includes('getFactoryStageHandler') && executor.includes('finalizeFactoryArtifactFromPolicy')) {
    pass('executor_registry_finalize', 'handler registry + artifact policy wired');
  } else {
    fail('executor_registry_finalize', 'missing registry or artifact policy');
    ok = false;
  }

  for (const file of [
    'lib/factoryRuntime/factoryStageHandlerRegistry.js',
    'lib/factoryRuntime/factoryIntentRegistry.js',
    'lib/factoryRuntime/factoryApprovalPolicy.js',
    'lib/factoryRuntime/factoryArtifactPolicy.js',
    'lib/factoryRuntime/factoryBootstrap.js',
    'lib/factoryRuntime/factories/campaignPackageFactoryV1.js',
  ]) {
    if (existsSync(resolve(root, 'src', file))) {
      pass('module_present', file);
    } else {
      fail('module_present', file);
      ok = false;
    }
  }

  const approval = readSrc('lib/factoryRuntime/factoryApprovalService.js');
  if (!approval.includes('creative_plan') && !approval.includes('video_plan')) {
    pass('approval_decoupled', 'no creative/video hardcoded paths');
  } else {
    fail('approval_decoupled', 'creative-specific branches remain');
    ok = false;
  }

  const router = readSrc('lib/factoryRuntime/factoryIntentRouter.js');
  if (router.includes('resolveFactoryIntent') && !router.match(/CREATIVE_VIDEO_LABELS/)) {
    pass('intent_router_registry', 'uses intent registry');
  } else {
    fail('intent_router_registry', 'still creative-hardcoded');
    ok = false;
  }

  const v2def = readSrc('lib/factoryRuntime/factories/creativeAssetFactoryV2.js');
  const campdef = readSrc('lib/factoryRuntime/factories/campaignPackageFactoryV1.js');
  if (v2def.includes('approvalPolicy') && v2def.includes('artifactPolicy')) {
    pass('v2_policies', 'approval + artifact policy on V2');
  } else {
    fail('v2_policies', 'missing policies');
    ok = false;
  }
  if (campdef.includes('campaign_package_factory_v1')) {
    pass('campaign_factory', 'campaign_package_factory_v1 definition present');
  } else {
    fail('campaign_factory', 'missing');
    ok = false;
  }

  const telemetry = readSrc('lib/factoryRuntime/factoryTelemetry.js');
  if (telemetry.includes('FACTORY_STAGE_TIMEOUT') && telemetry.includes('FACTORY_REQUIRED_ARTIFACT_MISSING')) {
    pass('timeout_telemetry', 'timeout + required artifact events');
  } else {
    fail('timeout_telemetry', 'missing emitters');
    ok = false;
  }

  const report = resolve(root, '../../../docs/FACTORY_RUNTIME_HARDENING_REPORT.md');
  if (existsSync(report)) {
    pass('report', 'FACTORY_RUNTIME_HARDENING_REPORT.md');
  } else {
    fail('report', 'missing');
    ok = false;
  }

  return ok;
}

async function inProcessChecks() {
  const { validateFactoryDefinition } = await import('../src/lib/factoryRuntime/factoryDefinition.js');
  const { creativeAssetFactoryV2 } = await import(
    '../src/lib/factoryRuntime/factories/creativeAssetFactoryV2.js'
  );
  const { campaignPackageFactoryV1 } = await import(
    '../src/lib/factoryRuntime/factories/campaignPackageFactoryV1.js'
  );
  const { bootstrapFactoryRuntime } = await import('../src/lib/factoryRuntime/factoryBootstrap.js');
  const {
    getFactoryStageHandler,
    listFactoryStageHandlers,
  } = await import('../src/lib/factoryRuntime/factoryStageHandlerRegistry.js');
  const { resolveFactoryIntent } = await import('../src/lib/factoryRuntime/factoryIntentRegistry.js');
  const { resetRuntimeAuthorityMetrics, getRuntimeAuthorityMetrics } = await import(
    '../src/lib/runtime/performerRuntime/runtimeAuthorityStaging.js'
  );

  for (const def of [creativeAssetFactoryV2, campaignPackageFactoryV1]) {
    const validated = validateFactoryDefinition(def);
    if (!validated.ok) {
      fail('registry', validated.errors);
      return false;
    }
  }
  pass('registry', { factories: ['creative_asset_factory_v2', 'campaign_package_factory_v1'] });

  bootstrapFactoryRuntime();

  const researchHandler = getFactoryStageHandler('creative_asset_factory_v2', 'research');
  if (typeof researchHandler === 'function') {
    pass('handler_registry', 'V2 research handler resolved');
  } else {
    fail('handler_registry', 'missing V2 handler');
    return false;
  }
  if (listFactoryStageHandlers('creative_asset_factory_v2').length >= 4) {
    pass('handler_registry_list', 'V2 builtin handlers registered');
  } else {
    fail('handler_registry_list', 'incomplete');
    return false;
  }

  const creativeIntent = resolveFactoryIntent(
    { intentLabel: 'create_video', userMessage: '' },
    {},
  );
  if (creativeIntent?.factoryId?.startsWith('creative_asset_factory')) {
    pass('intent_creative', creativeIntent.factoryId);
  } else {
    fail('intent_creative', creativeIntent);
    return false;
  }

  process.env.ENABLE_CAMPAIGN_PACKAGE_FACTORY = 'true';
  const campaignIntent = resolveFactoryIntent(
    { intentLabel: 'campaign_package', userMessage: 'create campaign package' },
    {},
  );
  if (campaignIntent?.factoryId === 'campaign_package_factory_v1') {
    pass('intent_campaign', campaignIntent.factoryId);
  } else {
    fail('intent_campaign', campaignIntent);
    return false;
  }

  const { execSync } = await import('node:child_process');
  try {
    execSync('npx vitest run src/lib/factoryRuntime/', { cwd: root, stdio: 'pipe' });
    pass('vitest', 'factoryRuntime unit tests pass');
  } catch (err) {
    fail('vitest', err?.stderr?.toString() ?? err?.message);
    return false;
  }

  resetRuntimeAuthorityMetrics();
  const { emitFactoryStageStarted } = await import('../src/lib/factoryRuntime/factoryTelemetry.js');
  emitFactoryStageStarted({
    factoryId: 'campaign_package_factory_v1',
    missionId: 'm-reuse',
    userId: 'u-reuse',
    stageId: 'market_research',
    stageIndex: 0,
  });
  const metrics = getRuntimeAuthorityMetrics();
  if (metrics.runtimeAuthorityBypass > 0) {
    fail('authority', { runtimeAuthorityBypass: metrics.runtimeAuthorityBypass });
    return false;
  }
  pass('authority', { runtimeAuthorityPathUsed: metrics.runtimeAuthorityPathUsed });
  return true;
}

async function main() {
  console.log('[factory-reusability-gauntlet] Factory Runtime Reusability Gauntlet');
  const staticOk = staticChecks();
  const inProcessOk = await inProcessChecks();

  if (staticOk && inProcessOk) {
    console.log('[factory-reusability-gauntlet] OVERALL PASS — non-creative factory runs without executor edits');
    process.exit(0);
  }
  console.log('[factory-reusability-gauntlet] OVERALL FAIL');
  process.exit(1);
}

main().catch((err) => {
  console.error('[factory-reusability-gauntlet] FATAL', err);
  process.exit(1);
});
