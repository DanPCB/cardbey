/**
 * Phase 5 — Global Resource Federation acceptance smoke.
 * Target verdict: URI_GLOBAL_FEDERATION_READY
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import { ensureUriReuseTables } from './ensure-uri-reuse-tables.mjs';
import { ensureUriWorkspaceTables } from './ensure-uri-workspace-tables.mjs';
import {
  ensureFederationReady,
  federationHealth,
  planFederationSources,
  planSearchFromIntent,
  discoverFromPlan,
  validateAdapterContract,
  getAdapter,
  listAdapters,
  assembleResourceKit,
  runBusinessTask,
  BUSINESS_TASK,
  buildResourceGraph,
  RESOURCE_CLASS,
  COMMERCIAL_LICENSE_STATE,
} from '../src/services/universalResourceIntelligence/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.env.ENABLE_UNIVERSAL_RESOURCE_INTELLIGENCE_V1 = 'true';
process.env.ENABLE_URI_FEDERATION_V1 = 'true';
process.env.ENABLE_URI_PROVIDER_SDK_V1 = 'true';
process.env.ENABLE_URI_FEDERATION_PLANNER_V1 = 'true';
process.env.ENABLE_URI_RESOURCE_GRAPH_V1 = 'true';
process.env.ENABLE_URI_REUSE_PILOT_V1 = 'true';
process.env.ENABLE_URI_WORKSPACE_V1 = 'true';
process.env.ENABLE_URI_PRODUCT_INTEGRATION_V1 = 'true';

const boundary = spawnSync(process.execPath, [path.join(__dirname, 'uri-consumer-boundary-assert.mjs')], {
  encoding: 'utf8',
});
assert.equal(boundary.status, 0, boundary.stdout + boundary.stderr);

await ensureFederationReady();
const adapters = listAdapters();
assert.ok(adapters.includes('src_pexels'));
assert.ok(adapters.includes('src_openverse'));
assert.ok(adapters.includes('src_pixabay'));
assert.ok(adapters.includes('src_unsplash'));
for (const id of adapters) {
  assert.equal(validateAdapterContract(getAdapter(id)).ok, true);
}

const health = federationHealth();
assert.equal(health.providerSdk, true);
assert.ok(health.adapters >= 4);

const intent = {
  id: 'intent_phase5',
  utterance: 'Build a café display playlist with a relaxing atmosphere',
  industry: 'food-drink',
  mediaType: 'image',
  channel: 'display',
  purpose: 'digital_display',
  rights: { preferOpenOrCleared: true, allowReference: true },
  preferences: { mood: 'calm' },
};

const fed = await planFederationSources(intent, { maxExternal: 3 });
assert.equal(fed.ok, true);
assert.ok(fed.selected.length >= 2);
assert.ok(Array.isArray(fed.skipped));
const externalSelected = fed.selected.filter((s) => s.resourceClass === RESOURCE_CLASS.OPEN_MEDIA);
assert.ok(externalSelected.length <= 3);

const plan = await planSearchFromIntent(intent);
assert.equal(plan.ok, true);
assert.ok(plan.searchPlan.federation);
assert.ok(plan.searchPlan.steps.length >= 2);

await ensurePrismaConnection();
await ensureUriReuseTables();
await ensureUriWorkspaceTables();

const discovery = await discoverFromPlan(prisma, plan.searchPlan, intent);
assert.equal(discovery.ok, true);
assert.equal(discovery.downloaded, false);

const kit = assembleResourceKit(
  (discovery.candidates || []).slice(0, 6).map((r) => ({
    resource: r,
    explanation: { custodyMode: r.technical?.custodyMode || 'PROVIDER_HOSTED' },
    rights: { decision: r.rightsSnapshot?.status },
  })),
  { businessTask: BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST, industry: 'food-drink', kitName: 'Phase5 Kit' },
);
assert.equal(kit.ok, true);

const graph = buildResourceGraph({ industry: 'food-drink', businessId: 'demo' });
assert.equal(graph.ok, true);
assert.ok(graph.graph.nodes.some((n) => n.type === 'concept'));

const display = await runBusinessTask(prisma, {
  task: BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST,
  goal: 'Build a café display playlist with a relaxing atmosphere',
  confirm: true,
  industry: 'food-drink',
});
assert.equal(display.ok, true);
assert.ok(display.kitAssembly || display.kit);

// Path C: search_hero_media must not import VideoSearchService
const heroPath = path.join(__dirname, '../src/lib/toolExecutors/media/search_hero_media.js');
const heroSrc = fs.readFileSync(heroPath, 'utf8');
assert.ok(!/from\s+['"][^'"]*VideoSearchService/.test(heroSrc));
assert.ok(/searchResourcesForConsumer/.test(heroSrc));

// Ops intake module exists
const opsPath = path.join(
  __dirname,
  '../src/services/universalResourceIntelligence/opsIntake.js',
);
assert.ok(fs.existsSync(opsPath));

assert.ok(COMMERCIAL_LICENSE_STATE.PURCHASE_REQUIRED);

console.log(
  JSON.stringify(
    {
      ok: true,
      verdict: 'URI_GLOBAL_FEDERATION_READY',
      adapters: adapters.length,
      adapterIds: adapters,
      federationSelected: fed.selected.map((s) => s.sourceId),
      federationSkipped: fed.skipped.length,
      discoveryCount: discovery.count,
      kitSlots: kit.summary?.slotsTotal,
      graphConcepts: graph.graph.nodes.filter((n) => n.type === 'concept').length,
      displayTaskOk: display.ok,
      commercialLicenseStatesModeled: true,
      pathC_search_hero_media: 'uri_consumer',
      pathA_opsIntake: 'federation_ops_intake',
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
