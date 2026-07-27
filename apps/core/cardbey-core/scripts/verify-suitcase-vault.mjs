#!/usr/bin/env node
/**
 * Phase 10.5 — Suitcase vault integration verification.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/verify-suitcase-vault.mjs
 *   node scripts/verify-suitcase-vault.mjs --live
 *
 * Env (optional live API probes):
 *   SUITCASE_CORE_URL — core API base (default http://127.0.0.1:3001)
 *   SUITCASE_AUDIT_TOKEN — bearer for /api/suitcase/items
 *   SUITCASE_AUDIT_OWNER_ID — expected owner id for list probe
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/lib/prisma.js';
import {
  createSuitcaseItem,
  deleteSuitcaseItem,
  getSuitcaseItem,
  listSuitcaseItems,
  saveBusinessBriefingSuitcaseItem,
} from '../src/services/suitcase/suitcaseItemService.js';
import { mirrorMissionOutputToSuitcase } from '../src/services/suitcase/suitcaseMissionOutputBridge.js';
import { saveUploadToSuitcase } from '../src/services/suitcase/suitcaseUploadBridge.js';
import { probeSuitcaseSchema, REQUIRED_COLUMNS } from '../src/services/suitcase/suitcaseBackfill.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(__dirname, '..');
const dashboardRoot = resolve(coreRoot, '../../dashboard/cardbey-marketing-dashboard');

for (const root of [coreRoot, dashboardRoot]) {
  for (const name of ['.env.local', '.env']) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m || process.env[m[1]] != null) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const live = process.argv.includes('--live');
const coreBase = (process.env.SUITCASE_CORE_URL || process.env.VITE_CORE_BASE_URL || 'http://127.0.0.1:3001').replace(
  /\/$/,
  '',
);

async function fetchText(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text };
}

/** @type {{ id: string; name: string; pass: boolean; detail?: string }[]} */
const checks = [];

function record(id, name, pass, detail) {
  checks.push({ id, name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

section('Unit tests (core)');
const coreVitest = spawnSync(
  'npx',
  [
    'cross-env',
    'PRISMA_CLIENT_ENGINE_TYPE=binary',
    'NODE_ENV=test',
    'ROLE=test',
    'DATABASE_URL=file:../test.db',
    'vitest',
    'run',
    'src/services/suitcase/suitcaseItemService.test.js',
  ],
  { cwd: coreRoot, stdio: 'inherit', shell: true },
);
record(
  'core_vitest',
  'Core suitcase service tests',
  coreVitest.status === 0,
  coreVitest.status === 0 ? 'vitest passed' : `exit ${coreVitest.status ?? 'unknown'}`,
);

section('Unit tests (dashboard handoff)');
if (existsSync(resolve(dashboardRoot, 'src/lib/suitcase/suitcasePerformerHandoff.test.ts'))) {
  const dashVitest = spawnSync(
    'npx',
    ['vitest', 'run', 'src/lib/suitcase/suitcasePerformerHandoff.test.ts'],
    { cwd: dashboardRoot, stdio: 'inherit', shell: true },
  );
  record(
    'dashboard_handoff_vitest',
    'Use in Performer autoSubmit:false',
    dashVitest.status === 0,
    dashVitest.status === 0 ? 'vitest passed' : `exit ${dashVitest.status ?? 'unknown'}`,
  );
} else {
  record('dashboard_handoff_vitest', 'Use in Performer autoSubmit:false', false, 'test file missing');
}

section('Database schema');
const prisma = getPrismaClient();
let schemaProbe = { tableExists: false, columnsOk: false, missingColumns: [], provider: null };
try {
  schemaProbe = await probeSuitcaseSchema(prisma);
  record(
    'table_exists',
    'SuitcaseItem table exists',
    schemaProbe.tableExists,
    `provider=${schemaProbe.provider ?? 'unknown'}`,
  );
  record(
    'required_columns',
    'Required columns present',
    schemaProbe.columnsOk,
    schemaProbe.missingColumns.length
      ? `missing: ${schemaProbe.missingColumns.join(', ')}`
      : `${REQUIRED_COLUMNS.length} columns ok`,
  );
} catch (err) {
  record('table_exists', 'SuitcaseItem table exists', false, String(err?.message ?? err));
  record('required_columns', 'Required columns present', false, 'probe failed');
}

section('In-process service checks');
if (schemaProbe.tableExists && prisma.suitcaseItem?.create) {
  const ownerA = `suitcase-audit-${Date.now()}`;
  const ownerB = `suitcase-audit-b-${Date.now()}`;
  try {
    await prisma.user.upsert({
      where: { id: ownerA },
      create: { id: ownerA, email: `${ownerA}@audit.local`, passwordHash: 'audit' },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: ownerB },
      create: { id: ownerB, email: `${ownerB}@audit.local`, passwordHash: 'audit' },
      update: {},
    });

    const created = await createSuitcaseItem(
      {
        ownerId: ownerA,
        storeId: 'store-audit',
        sourceType: 'artifact',
        contentType: 'json',
        title: 'Audit artifact',
      },
      prisma,
    );
    record('owner_create', 'Owner can create suitcase item', Boolean(created.item?.id), created.item?.id ?? 'no id');

    const listed = await listSuitcaseItems({ ownerId: ownerA, storeId: 'store-audit' }, prisma);
    record(
      'owner_list_filter',
      'List filters by owner/store',
      listed.items.some((i) => i.id === created.item?.id),
      `count=${listed.items.length}`,
    );

    let crossReadBlocked = false;
    try {
      await getSuitcaseItem({ ownerId: ownerB, itemId: created.item.id }, prisma);
    } catch (err) {
      crossReadBlocked = err.statusCode === 404 || err.statusCode === 403;
    }
    record('cross_owner_read', 'Cross-owner read blocked (403/404)', crossReadBlocked);

    const briefing1 = await saveBusinessBriefingSuitcaseItem(
      {
        ownerId: ownerA,
        storeId: 'store-audit',
        snapshotId: 'store-audit:audit-snap',
        storeName: 'Audit Store',
        briefing: {
          greeting: 'Hi',
          storeName: 'Audit Store',
          healthScore: 50,
          todaySummary: ['ok'],
          needsAttention: [],
          recentExperience: [],
          ownerContext: [],
          suggestedActions: [],
        },
      },
      prisma,
    );
    const briefing2 = await saveBusinessBriefingSuitcaseItem(
      {
        ownerId: ownerA,
        storeId: 'store-audit',
        snapshotId: 'store-audit:audit-snap',
        storeName: 'Audit Store',
        briefing: {
          greeting: 'Hi',
          storeName: 'Audit Store',
          healthScore: 50,
          todaySummary: ['ok'],
          needsAttention: [],
          recentExperience: [],
          ownerContext: [],
          suggestedActions: [],
        },
      },
      prisma,
    );
    record(
      'briefing_idempotent',
      'Briefing save is idempotent',
      briefing1.created === true && briefing2.created === false,
      `first=${String(briefing1.created)} second=${String(briefing2.created)}`,
    );

    const missionMirror = await mirrorMissionOutputToSuitcase(
      {
        ownerId: ownerA,
        storeId: 'store-audit',
        missionId: `mission-audit-${Date.now()}`,
        missionOutputs: { offer: { title: 'Audit Offer' } },
        missionStatus: 'completed',
      },
      prisma,
    );
    record(
      'mission_mirror',
      'Mission output mirror works',
      Boolean(missionMirror.item?.id),
      missionMirror.item?.sourceType ?? String(missionMirror.reason ?? missionMirror.skipped),
    );

    const uploadMirror = await saveUploadToSuitcase(
      {
        ownerId: ownerA,
        storeId: 'store-audit',
        fileUrl: `https://audit.example/doc-${Date.now()}.pdf`,
        originalFilename: 'menu.pdf',
        mimeType: 'application/pdf',
      },
      prisma,
    );
    record(
      'upload_mirror',
      'Upload/scan mirror works',
      Boolean(uploadMirror.item?.id),
      uploadMirror.item?.sourceType ?? 'skipped',
    );

    let crossDeleteBlocked = false;
    try {
      await deleteSuitcaseItem({ ownerId: ownerB, itemId: created.item.id }, prisma);
    } catch (err) {
      crossDeleteBlocked = err.statusCode === 404 || err.statusCode === 403;
    }
    record('cross_owner_delete', 'Delete only owner item (cross-owner blocked)', crossDeleteBlocked);

    await deleteSuitcaseItem({ ownerId: ownerA, itemId: created.item.id }, prisma);
    let deletedGone = false;
    try {
      await getSuitcaseItem({ ownerId: ownerA, itemId: created.item.id }, prisma);
    } catch (err) {
      deletedGone = err.statusCode === 404;
    }
    record('owner_delete', 'Owner can delete own item', deletedGone);

    // Cleanup audit rows
    await prisma.suitcaseItem.deleteMany({ where: { ownerId: { in: [ownerA, ownerB] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } }).catch(() => {});
  } catch (err) {
    record('owner_create', 'Owner can create suitcase item', false, String(err?.message ?? err));
  }
} else {
  record('owner_create', 'Owner can create suitcase item', false, 'table/model unavailable — run migration');
  record('in_process_skipped', 'In-process checks skipped', true, 'migration required');
}

if (live) {
  section('Live API probes');
  const token = process.env.SUITCASE_AUDIT_TOKEN?.trim();

  if (!token) {
    record('api_list_200', 'GET /api/suitcase/items returns 200', false, 'SUITCASE_AUDIT_TOKEN not set');
  } else {
    try {
      const { res, text } = await fetchText(`${coreBase}/api/suitcase/items?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let body = {};
      try {
        body = JSON.parse(text);
      } catch {
        /* ignore */
      }
      const ok = res.status === 200 && Array.isArray(body.items);
      record('api_list_200', 'GET /api/suitcase/items returns 200', ok, `status=${res.status}`);
      record('no_p2022', 'No Prisma P2022 on suitcase list', !text.includes('P2022'), `status=${res.status}`);

      const foreignId = 'nonexistent-suitcase-item-id';
      const foreign = await fetchText(`${coreBase}/api/suitcase/items/${foreignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      record(
        'api_cross_owner_404',
        'Cross-owner/unknown item returns 403/404',
        foreign.res.status === 404 || foreign.res.status === 403,
        `status=${foreign.res.status}`,
      );
    } catch (err) {
      record('api_list_200', 'GET /api/suitcase/items returns 200', false, String(err?.message ?? err));
    }
  }
}

await prisma.$disconnect().catch(() => {});

section('Summary');
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exit(1);
}
