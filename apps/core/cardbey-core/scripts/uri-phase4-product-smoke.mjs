/**
 * URI Phase 4 — Invisible intelligence / product integration smoke.
 * Business tasks → URI → drafts (no Resource Workspace UI required).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import { ensureUriReuseTables } from './ensure-uri-reuse-tables.mjs';
import { ensureUriWorkspaceTables } from './ensure-uri-workspace-tables.mjs';
import {
  runBusinessTask,
  listBusinessTasks,
  saveResourceKit,
  buildResourceGraph,
  recommendResources,
  suggestCapabilitiesFromPatterns,
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

await ensurePrismaConnection();
await ensureUriReuseTables();
await ensureUriWorkspaceTables();

const tasks = listBusinessTasks();
const display = await runBusinessTask(prisma, {
  task: BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST,
  goal: 'Build a café display playlist with a relaxing atmosphere',
  confirm: true,
  saveKit: true,
  kitName: 'French Café Kit',
  industry: 'food-drink',
});
if (!display.ok) {
  console.error(display);
  process.exit(1);
}

const promo = await runBusinessTask(prisma, {
  task: BUSINESS_TASK.CREATE_PROMOTION,
  goal: 'Create a Facebook promotion for my café',
  confirm: true,
  industry: 'food-drink',
});
if (!promo.ok) {
  console.error(promo);
  process.exit(1);
}

const assistant = await runBusinessTask(prisma, {
  task: BUSINESS_TASK.ASSISTANT_ASSEMBLE_DRAFT,
  goal: 'Create a promotion for my café',
  confirm: false, // preview without place
});

const kit = saveResourceKit({
  name: 'French Café Kit',
  industry: 'food-drink',
  resourceIds: (display.candidates || []).slice(0, 6).map((c) => c.resource.id),
});
const graph = buildResourceGraph({ industry: 'food-drink', businessId: 'demo-store' });
const recs = recommendResources({ industry: 'food-drink', limit: 5 });
const caps = suggestCapabilitiesFromPatterns({ industry: 'food-drink' });

const destinations = [
  display.placement?.placements?.[0]?.destination,
  promo.placement?.placements?.[0]?.destination,
].filter(Boolean);

const report = {
  ok: true,
  verdict: 'URI_INVISIBLE_INTELLIGENCE_LAYER_READY',
  taskCatalog: tasks.length,
  display: {
    ok: display.ok,
    workspaceHiddenFromUser: display.ui?.exposeResourceWorkspace === false,
    destination: display.destination,
    placed: Boolean(display.placement?.ok),
    playlistId: display.placement?.placements?.[0]?.draft?.playlistId || null,
    contextActions: display.candidates?.[0]?.contextActions?.map((a) => a.action) || [],
  },
  promo: {
    ok: promo.ok,
    destination: promo.destination,
    placed: Boolean(promo.placement?.ok),
  },
  assistant: {
    ok: assistant.ok,
    workspaceHiddenFromUser: assistant.ui?.exposeResourceWorkspace === false,
    candidates: assistant.candidates?.length || 0,
  },
  kit: { id: kit.kit?.id, name: kit.kit?.name },
  graphNodes: graph.graph?.nodes?.length || 0,
  recommendations: recs.recommendations?.length || 0,
  capabilitySuggestions: caps.suggestions?.length || 0,
  destinationsUsed: [...new Set(destinations)],
  published: false,
};

if (report.destinationsUsed.length < 2) {
  console.error({ ok: false, error: 'need_two_task_destinations', report });
  process.exit(1);
}
if (display.ui?.exposeResourceWorkspace !== false) {
  console.error({ ok: false, error: 'workspace_must_stay_hidden', report });
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
