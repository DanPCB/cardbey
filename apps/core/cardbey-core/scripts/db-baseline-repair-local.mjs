#!/usr/bin/env node
/**
 * Conservative local migration history repair (dev only).
 * 1) Marks migration folders as applied when SQL is already reflected in schema.
 * 2) Writes docs/db/baseline-acceptance.local.json when Option A verification passes.
 *
 * Usage:
 *   npm run db:baseline:repair-local -- --dry-run
 *   npm run db:baseline:repair-local -- --apply
 *   npm run db:baseline:repair-local -- --accept-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import {
  analyzeMigrationDrift,
  buildSchemaFingerprint,
  MIGRATIONS_DIR,
  verifyOptionABaseline,
  writeBaselineAcceptance,
} from '../src/lib/schemaFingerprint.js';
import {
  markMigrationsApplied,
  migrationSqlReflectsSchema,
} from '../src/lib/migrationBaselineRepair.js';
import { CANONICAL_DEV_DB, PACKAGE_ROOT, resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const dryRunOnly = process.argv.includes('--dry-run') && !process.argv.includes('--apply');
const apply = process.argv.includes('--apply');
const acceptOnly = process.argv.includes('--accept-only');

if (process.env.NODE_ENV === 'production' || process.env.RENDER_SERVICE_ID) {
  console.error('[db:baseline:repair-local] Refusing on production/Render.');
  process.exit(1);
}

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env'), override: true });
process.env.DATABASE_URL = 'file:../dev.db';
const dbPath = resolveSqliteDatabasePath() || CANONICAL_DEV_DB;

if (path.resolve(dbPath) !== path.resolve(CANONICAL_DEV_DB)) {
  console.error('[db:baseline:repair-local] DATABASE_URL must resolve to canonical prisma/dev.db');
  process.exit(1);
}

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(dbPath);

function tableExists(table) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
}

function tableHasColumn(table, column) {
  if (!tableExists(table)) return false;
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
  return cols.some((c) => c.name === column);
}

function migrationSqlReflectsSchemaLocal(migrationName) {
  const sqlPath = path.join(MIGRATIONS_DIR, migrationName, 'migration.sql');
  if (!fs.existsSync(sqlPath)) return { safe: false, reason: 'no migration.sql' };
  const sql = fs.readFileSync(sqlPath, 'utf8');
  return migrationSqlReflectsSchema(db, sql);
}

function getAppliedSet() {
  const rows = db.prepare('SELECT migration_name FROM _prisma_migrations').all();
  return new Set(rows.map((r) => r.migration_name));
}

const appliedSet = getAppliedSet();
const drift = analyzeMigrationDrift(dbPath);
const missingNotApplied = drift.missingApplied.filter((name) => !appliedSet.has(name));

const candidates = [];
for (const name of missingNotApplied) {
  const check = migrationSqlReflectsSchemaLocal(name);
  if (check.safe) candidates.push({ name, ...check });
}

console.log('[db:baseline:repair-local]', {
  mode: acceptOnly ? 'accept-only' : dryRunOnly ? 'dry-run' : apply ? 'apply' : 'preview',
  dbPath,
  missingApplied: drift.missingApplied.length,
  repairable: candidates.length,
  orphanInDb: drift.unappliedInDb.length,
});

for (const c of candidates) {
  console.log(`  + repair ${c.name} (${c.reason})`);
}

const previewFp = buildSchemaFingerprint();
const canAccept = verifyOptionABaseline(previewFp);
console.log('[db:baseline:repair-local] Option A verification:', canAccept ? 'PASS' : 'FAIL');

if (!apply && !acceptOnly && !dryRunOnly) {
  console.log('\nRe-run with --dry-run, --apply, or --accept-only');
  process.exit(0);
}

if (dryRunOnly) {
  if (canAccept) {
    console.log('[db:baseline:repair-local] dry-run: would write baseline-acceptance.local.json on --apply');
  }
  for (const c of candidates) {
    console.log(`  (dry-run) would mark applied: ${c.name}`);
  }
  process.exit(canAccept ? 0 : 1);
}

let inserted = 0;
if (!acceptOnly && apply) {
  db.close();
  inserted = markMigrationsApplied(
    dbPath,
    candidates.map((c) => c.name),
    MIGRATIONS_DIR,
  );
  for (const c of candidates) {
    console.log('[db:baseline:repair-local] marked applied:', c.name);
  }
} else {
  db.close();
}

const fp = buildSchemaFingerprint();
if (!verifyOptionABaseline(fp)) {
  console.error('[db:baseline:repair-local] Cannot accept baseline — verification failed.');
  console.error('  requiredColumnsOk:', fp.requiredColumnsOk);
  console.error('  schemaHashMatch:', fp.schemaHashMatch);
  console.error('  tableHashMatch:', fp.tableHashMatch);
  console.error('  ghostDbFiles:', fp.ghostDbFiles?.length ?? 0);
  process.exit(1);
}

const acceptance = writeBaselineAcceptance(fp);
console.log('[db:baseline:repair-local] wrote baseline acceptance:', acceptance);
console.log('[db:baseline:repair-local] inserted migration rows:', inserted);
console.log('Next: npm run db:fingerprint && npm run db:health:local');
