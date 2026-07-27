/**
 * Factory Runtime V1 gauntlet.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/factory-runtime-v1-gauntlet.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../../..', '.env') });
loadEnv({ path: resolve(root, '.env'), override: true });

function pass(name, detail) {
  console.log(`[factory-v1-gauntlet] PASS ${name}`, detail ?? '');
}
function fail(name, detail) {
  console.log(`[factory-v1-gauntlet] FAIL ${name}`, detail ?? '');
}

function readSrc(relPath) {
  const abs = resolve(root, 'src', relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function staticChecks() {
  let ok = true;

  const def = readSrc('lib/factoryRuntime/factoryDefinition.js');
  if (def.includes('validateFactoryDefinition') && def.includes('stages')) {
    pass('factory_definition', 'contract module present');
  } else {
    fail('factory_definition', 'missing');
    ok = false;
  }

  const executor = readSrc('lib/factoryRuntime/factoryRuntimeExecutor.js');
  if (executor.includes('runFactoryExecution') && executor.includes('dispatchTool')) {
    pass('factory_executor', 'executor present');
  } else {
    fail('factory_executor', 'missing');
    ok = false;
  }

  const factoryDef = readSrc('lib/factoryRuntime/factories/creativeAssetFactoryV1.js');
  const registry = readSrc('lib/factoryRuntime/factoryRegistry.js');
  if (factoryDef.includes('creative_asset_factory_v1') && registry.includes('registerFactory')) {
    pass('factory_registry', 'creative_asset_factory_v1 registered');
  } else {
    fail('factory_registry', 'missing factory');
    ok = false;
  }

  const runtime = readSrc('lib/runtime/performerRuntime/executeRuntimeAction.js');
  if (runtime.includes("actionType === 'run_factory'")) {
    pass('performer_runtime', 'run_factory action wired');
  } else {
    fail('performer_runtime', 'run_factory missing');
    ok = false;
  }

  const routes = readSrc('routes/performerRuntimeRoutes.js');
  if (routes.includes('/run-factory') && routes.includes('/factory-approval')) {
    pass('api_routes', 'factory API routes present');
  } else {
    fail('api_routes', 'routes missing');
    ok = false;
  }

  const telemetry = readSrc('lib/factoryRuntime/factoryTelemetry.js');
  if (
    telemetry.includes('FACTORY_STAGE_STARTED') &&
    telemetry.includes('recordRuntimeAuthorityPathUsed')
  ) {
    pass('telemetry', 'factory + authority telemetry');
  } else {
    fail('telemetry', 'incomplete');
    ok = false;
  }

  const report = resolve(root, '../../../docs/FACTORY_RUNTIME_V1_REPORT.md');
  if (existsSync(report)) {
    pass('report', 'FACTORY_RUNTIME_V1_REPORT.md');
  } else {
    fail('report', 'missing');
    ok = false;
  }

  return ok;
}

async function inProcessChecks() {
  const { getFactory } = await import('../src/lib/factoryRuntime/factoryRegistry.js');
  const { validateFactoryDefinition } = await import('../src/lib/factoryRuntime/factoryDefinition.js');
  const { resetRuntimeAuthorityMetrics, getRuntimeAuthorityMetrics } = await import(
    '../src/lib/runtime/performerRuntime/runtimeAuthorityStaging.js'
  );

  const factory = getFactory('creative_asset_factory_v1');
  if (!factory) {
    fail('in_process', 'factory not registered');
    return false;
  }

  const validated = validateFactoryDefinition(factory);
  if (!validated.ok) {
    fail('in_process', validated.errors);
    return false;
  }

  // Run vitest unit tests as in-process flow validation.
  const { execSync } = await import('node:child_process');
  try {
    execSync(
      'npx vitest run src/lib/factoryRuntime/factoryRuntimeExecutor.test.js',
      { cwd: root, stdio: 'pipe' },
    );
    pass('in_process', 'factoryRuntimeExecutor tests pass');
  } catch (err) {
    fail('in_process', err?.stderr?.toString() ?? err?.message);
    return false;
  }

  resetRuntimeAuthorityMetrics();
  const { emitFactoryStageStarted } = await import('../src/lib/factoryRuntime/factoryTelemetry.js');
  emitFactoryStageStarted({
    factoryId: 'creative_asset_factory_v1',
    missionId: 'm-gauntlet',
    userId: 'u-gauntlet',
    stageId: 'creative_plan',
    stageIndex: 0,
  });
  const metrics = getRuntimeAuthorityMetrics();
  if (metrics.runtimeAuthorityBypass > 0) {
    fail('authority', { runtimeAuthorityBypass: metrics.runtimeAuthorityBypass });
    return false;
  }
  if (metrics.runtimeAuthorityPathUsed < 1) {
    fail('authority', 'no RUNTIME_AUTHORITY_PATH_USED');
    return false;
  }
  pass('authority', { runtimeAuthorityPathUsed: metrics.runtimeAuthorityPathUsed });
  return true;
}

async function main() {
  console.log('[factory-v1-gauntlet] Factory Runtime V1 Gauntlet');
  const staticOk = staticChecks();
  const inProcessOk = await inProcessChecks();

  if (staticOk && inProcessOk) {
    console.log('[factory-v1-gauntlet] OVERALL PASS');
    process.exit(0);
  }
  console.log('[factory-v1-gauntlet] OVERALL FAIL');
  process.exit(1);
}

main().catch((err) => {
  console.error('[factory-v1-gauntlet] FATAL', err);
  process.exit(1);
});
