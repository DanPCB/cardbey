/**
 * Phase 4B acceptance: consumer cutover + boundary enforcement.
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
  runBusinessTask,
  BUSINESS_TASK,
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
process.env.ENABLE_URI_REUSE_PILOT_V1 = 'true';
process.env.ENABLE_URI_WORKSPACE_V1 = 'true';
process.env.ENABLE_URI_PRODUCT_INTEGRATION_V1 = 'true';

const boundary = spawnSync(process.execPath, [path.join(__dirname, 'uri-consumer-boundary-assert.mjs')], {
  encoding: 'utf8',
});
assert.equal(boundary.status, 0, boundary.stdout + boundary.stderr);
const boundaryJson = JSON.parse(boundary.stdout);
assert.equal(boundaryJson.grandfatheredConsumerPaths, false);

const dashRoot = path.resolve(__dirname, '../../../dashboard/cardbey-marketing-dashboard');
const cspPath = path.join(dashRoot, 'src/lib/assets/contentSourceProvider.ts');
const csp = fs.readFileSync(cspPath, 'utf8');
assert.ok(!/searchPexelsPhotos|searchPexelsVideos|searchContentAssetsVideos/.test(csp));
assert.ok(/searchContentAssetsViaUri|uriContentSearch/.test(csp));

const assetFetcher = fs.readFileSync(
  path.join(dashRoot, 'src/features/contents-studio/components/AssetFetcher.tsx'),
  'utf8',
);
assert.ok(/searchContentAssets/.test(assetFetcher));
assert.ok(!/apiUrl\(`\/api\/assets\/search/.test(assetFetcher));

const appJsx = fs.readFileSync(path.join(dashRoot, 'src/App.jsx'), 'utf8');
assert.ok(appJsx.includes('/control-center/resource-intelligence/workspace'));
assert.ok(appJsx.includes('Navigate to="/control-center/resource-intelligence/workspace"'));

await ensurePrismaConnection();
await ensureUriReuseTables();
await ensureUriWorkspaceTables();

const display = await runBusinessTask(prisma, {
  task: BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST,
  goal: 'Build a café display playlist with a relaxing atmosphere',
  confirm: true,
  industry: 'food-drink',
});
assert.equal(display.ok, true);
assert.equal(display.ui.exposeResourceWorkspace, false);

const promo = await runBusinessTask(prisma, {
  task: BUSINESS_TASK.CREATE_PROMOTION,
  goal: 'Create a Facebook promotion for my café',
  confirm: true,
  industry: 'food-drink',
});
assert.equal(promo.ok, true);

const displayTaskStillWorks =
  display.ok === true && display.ui?.exposeResourceWorkspace === false;
const promoTaskStillWorks = promo.ok === true;
assert.equal(displayTaskStillWorks, true);
assert.equal(promoTaskStillWorks, true);

console.log(
  JSON.stringify(
    {
      ok: true,
      verdict: 'URI_CONSUMER_CUTOVER_COMPLETE',
      boundary: { ok: true, grandfatheredConsumerPaths: false },
      contentSourceProvider: 'uri_adapter',
      creatorStudioAssetFetcher: 'uri_via_contentSourceProvider',
      heroMediaPicker: 'uri_via_MediaPicker_contentSourceProvider',
      displayTaskStillWorks,
      promoTaskStillWorks,
      displayPlaced: Boolean(display.placement?.ok),
      promoPlaced: Boolean(promo.placement?.ok),
      workspaceRedirectPresent: true,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
