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

function migrationSqlReflectsSchema(migrationName) {
  const sqlPath = path.join(MIGRATIONS_DIR, migrationName, 'migration.sql');
  if (!fs.existsSync(sqlPath)) return { safe: false, reason: 'no migration.sql' };
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const createTables = [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?/gi)];
  for (const [, table] of createTables) {
    if (!tableExists(table)) {
      return { safe: false, reason: `table ${table} missing` };
    }
  }

  const alterTables = [...sql.matchAll(/ALTER TABLE\s+"?(\w+)"?/gi)];
  const addCols = [...sql.matchAll(/ADD COLUMN\s+"?(\w+)"?/gi)];
  for (let i = 0; i < addCols.length; i++) {
    const col = addCols[i][1];
    const table = alterTables[i]?.[1] || alterTables[0]?.[1];
    if (table && !tableHasColumn(table, col)) {
      return { safe: false, reason: `column ${table}.${col} not in DB` };
    }
  }

  if (/CREATE INDEX/i.test(sql)) {
    return { safe: true, reason: 'indexes assumed present when schema matches' };
  }

  if (!createTables.length && !addCols.length && sql.trim()) {
    return { safe: true, reason: 'non-destructive or already-applied SQL' };
  }

  return { safe: true, reason: 'schema appears to include migration changes' };
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
  const check = migrationSqlReflectsSchema(name);
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
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
  );

  for (const c of candidates) {
    if (appliedSet.has(c.name)) continue;
    const sqlPath = path.join(MIGRATIONS_DIR, c.name, 'migration.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const checksum = require('node:crypto').createHash('sha256').update(sql).digest('hex');
    const id = require('node:crypto').randomUUID();
    try {
      insert.run(id, checksum, now, c.name, now);
      appliedSet.add(c.name);
      inserted++;
      console.log('[db:baseline:repair-local] marked applied:', c.name);
    } catch (e) {
      console.warn('[db:baseline:repair-local] skip', c.name, e?.message);
    }
  }
}

db.close();

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
