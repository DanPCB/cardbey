#!/usr/bin/env node
/**
 * Review-only migration SQL guard for Device V2 Phase 1.
 *
 * Default: scan committed Phase 1 migration SQL files.
 *
 *   node scripts/prisma-migration-diff-guard.mjs
 *   node scripts/prisma-migration-diff-guard.mjs --file=path/to.sql
 *
 * Override (explicit): ALLOW_DESTRUCTIVE_PRISMA_SQL=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** DDL that must not appear against unrelated tables */
const FORBIDDEN_DDL = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bALTER\s+TABLE\s+"?Creator"?\b/i,
  /\bALTER\s+TABLE\s+"?CreatorClassification"?\b/i,
  /\bALTER\s+TABLE\s+"?CreatorContent"?\b/i,
  /\bALTER\s+TABLE\s+"?CreatorPublishingDecision"?\b/i,
  /\bALTER\s+TABLE\s+"?CreatorPublishingEvent"?\b/i,
  /\bALTER\s+TABLE\s+"?Product"?\b/i,
  /\bALTER\s+TABLE\s+"?StorePromo"?\b/i,
  /\bALTER\s+TABLE\s+"?LoyaltyProgram"?\b/i,
  /\bALTER\s+TABLE\s+"?DocumentTopologyRevision"?\b/i,
  /\bCREATE\s+TABLE\s+"?Creator\b/i,
];

function scanSql(label, sql) {
  const hits = [];
  for (const re of FORBIDDEN_DDL) {
    if (re.test(sql)) hits.push(String(re));
  }
  if (hits.length) {
    console.error(`[diff-guard] FAIL ${label}:`, hits);
    return false;
  }
  console.log(`[diff-guard] OK ${label}: no destructive/unrelated DDL`);
  return true;
}

const files = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--file=')) {
    files.push(path.resolve(root, arg.slice('--file='.length)));
  }
}
if (!files.length) {
  files.push(
    path.join(
      root,
      'prisma/sqlite/migrations/20260715120000_device_installation_id/migration.sql',
    ),
    path.join(
      root,
      'prisma/postgres/migrations/20260715120000_device_installation_id/migration.sql',
    ),
  );
}

let ok = true;
for (const file of files) {
  const rel = path.relative(root, file);
  if (!fs.existsSync(file)) {
    console.error('[diff-guard] missing:', rel);
    ok = false;
    continue;
  }
  const sql = fs.readFileSync(file, 'utf8');
  if (!scanSql(rel, sql)) ok = false;

  if (file.includes('device_installation_id')) {
    if (!/ALTER\s+TABLE\s+"Device"\s+ADD\s+COLUMN/i.test(sql)) {
      console.error('[diff-guard] FAIL: expected ALTER TABLE "Device" ADD COLUMN');
      ok = false;
    }
    if (!/installationId/.test(sql)) {
      console.error('[diff-guard] FAIL: expected installationId');
      ok = false;
    }
    if (!/Device_installationId_idx/.test(sql)) {
      console.error('[diff-guard] FAIL: expected Device_installationId_idx');
      ok = false;
    }
    if (/CREATE\s+UNIQUE\s+INDEX/i.test(sql)) {
      console.error('[diff-guard] FAIL: Phase 1 must not create UNIQUE index');
      ok = false;
    }
    // Ensure only Device is altered
    const alterTables = [...sql.matchAll(/ALTER\s+TABLE\s+"([^"]+)"/gi)].map((m) => m[1]);
    if (alterTables.some((t) => t !== 'Device')) {
      console.error('[diff-guard] FAIL: non-Device ALTER TABLE detected:', alterTables);
      ok = false;
    }
  }
}

if (!ok) {
  if (process.env.ALLOW_DESTRUCTIVE_PRISMA_SQL === '1') {
    console.warn('[diff-guard] ALLOW_DESTRUCTIVE_PRISMA_SQL=1 override');
    process.exit(0);
  }
  process.exit(1);
}
console.log('[diff-guard] all scanned SQL files passed');
