#!/usr/bin/env node
/**
 * Read-only audit of Prisma SQLite migrations under prisma/migrations.
 * Does not modify the database or migration files.
 *
 * Usage:
 *   node scripts/audit-sqlite-migrations.mjs
 *   node scripts/audit-sqlite-migrations.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import '../src/env/ensureDatabaseUrl.js';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.join(__dirname, '..');
const migrationsDir = path.join(coreRoot, 'prisma', 'migrations');
const jsonMode = process.argv.includes('--json');

const ADD_COLUMN_IF_NOT_EXISTS = /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i;
const ADD_COLUMN = /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+"([^"]+)"/gi;
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
const TABLE_REF = /(?:ALTER\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?|DROP\s+INDEX)\s+"?([^"\s(]+)"?/gi;
const DROP_INDEX = /DROP\s+INDEX\s+"([^"]+)"/gi;
const DROP_TABLE = /DROP\s+TABLE\s+"([^"]+)"/gi;
const CREATE_INDEX_ON = /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"[^"]+"\s+ON\s+"([^"]+)"/gi;

function listMigrationFolders() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => fs.statSync(path.join(migrationsDir, name)).isDirectory())
    .sort();
}

function readMigrationSql(name) {
  const file = path.join(migrationsDir, name, 'migration.sql');
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function collectMatches(regex, sql, mapFn = (m) => m) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.push(mapFn(m));
  }
  return out;
}

function auditSqliteIncompatible(migrations) {
  const findings = [];
  for (const name of migrations) {
    const sql = readMigrationSql(name);
    const lines = sql.split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) return;
      if (ADD_COLUMN_IF_NOT_EXISTS.test(trimmed)) {
        findings.push({
          migration: name,
          line: idx + 1,
          kind: 'sqlite_incompatible',
          detail: 'ALTER TABLE ... ADD COLUMN IF NOT EXISTS is invalid in SQLite',
          sql: trimmed,
        });
      }
      if (/^DROP\s+INDEX\s+/i.test(trimmed) && !/^DROP\s+INDEX\s+IF\s+EXISTS/i.test(trimmed)) {
        findings.push({
          migration: name,
          line: idx + 1,
          kind: 'sqlite_risky',
          detail: 'DROP INDEX without IF EXISTS may fail when index is absent',
          sql: trimmed,
        });
      }
      if (/^DROP\s+TABLE\s+/i.test(trimmed) && !/^DROP\s+TABLE\s+IF\s+EXISTS/i.test(trimmed)) {
        findings.push({
          migration: name,
          line: idx + 1,
          kind: 'sqlite_risky',
          detail: 'DROP TABLE without IF EXISTS may fail when table is absent',
          sql: trimmed,
        });
      }
      if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i.test(trimmed)) {
        findings.push({
          migration: name,
          line: idx + 1,
          kind: 'sqlite_risky',
          detail: 'CREATE INDEX without IF NOT EXISTS may fail on re-apply/drift repair',
          sql: trimmed,
        });
      }
    });
  }
  return findings;
}

function auditDuplicateColumns(migrations, liveColumnsByTable) {
  const tableColumns = new Map();
  const findings = [];

  for (const name of migrations) {
    const sql = readMigrationSql(name);
    for (const match of collectMatches(ADD_COLUMN, sql)) {
      const table = match[1];
      const column = match[2];
      if (!tableColumns.has(table)) tableColumns.set(table, new Set());
      const known = tableColumns.get(table);
      if (known.has(column)) {
        findings.push({
          migration: name,
          kind: 'duplicate_column_risk',
          table,
          column,
          detail: `Column "${column}" on "${table}" was already added in an earlier migration`,
        });
      } else {
        known.add(column);
      }

      const liveCols = liveColumnsByTable?.get(table);
      if (liveCols?.has(column)) {
        findings.push({
          migration: name,
          kind: 'duplicate_column_live',
          table,
          column,
          detail: `Column "${column}" already exists on live "${table}" — ADD COLUMN would fail`,
        });
      }
    }
  }
  return findings;
}

function auditMissingTables(migrations, liveTables) {
  const createdTables = new Set();
  const findings = [];

  for (const name of migrations) {
    const sql = readMigrationSql(name);
    for (const table of collectMatches(CREATE_TABLE, sql, (m) => m[1])) {
      createdTables.add(table);
    }

    const referenced = new Set([
      ...collectMatches(CREATE_INDEX_ON, sql, (m) => m[1]),
      ...collectMatches(/ALTER\s+TABLE\s+"([^"]+)"/gi, sql, (m) => m[1]),
      ...collectMatches(DROP_INDEX, sql, (m) => {
        const idx = m[1];
        return null;
      }).filter(Boolean),
    ]);

    for (const match of collectMatches(/ALTER\s+TABLE\s+"([^"]+)"/gi, sql)) {
      const table = match[1];
      if (table === '_prisma_migrations') continue;
      if (!createdTables.has(table) && !liveTables?.has(table)) {
        findings.push({
          migration: name,
          kind: 'missing_table_dependency',
          table,
          detail: `Migration references "${table}" before any CREATE TABLE in migration history`,
        });
      }
    }

    for (const match of collectMatches(CREATE_INDEX_ON, sql)) {
      const table = match[1];
      if (!createdTables.has(table) && !liveTables?.has(table)) {
        findings.push({
          migration: name,
          kind: 'missing_table_dependency',
          table,
          detail: `CREATE INDEX targets "${table}" but table is not created earlier in migration history`,
        });
      }
    }
  }

  return findings;
}

function auditMigrationDrift(migrations, db) {
  const disk = new Set(migrations);
  const result = {
    dbMissingLocally: [],
    localNotApplied: [],
    failed: [],
    staleFailedDuplicates: [],
  };

  if (!db) return result;

  const appliedRows = db
    .prepare(
      `SELECT migration_name, finished_at, rolled_back_at, logs
       FROM _prisma_migrations ORDER BY started_at`,
    )
    .all();

  const applied = new Set(
    appliedRows.filter((r) => r.finished_at != null).map((r) => r.migration_name),
  );
  const dbNames = new Set(appliedRows.map((r) => r.migration_name));

  for (const name of dbNames) {
    if (!disk.has(name)) result.dbMissingLocally.push(name);
  }
  for (const name of disk) {
    if (!applied.has(name)) result.localNotApplied.push(name);
  }

  const failed = appliedRows.filter(
    (r) => r.finished_at == null && r.rolled_back_at == null && r.logs,
  );
  result.failed = failed.map((r) => r.migration_name);

  for (const row of failed) {
    const hasSuccess = appliedRows.some(
      (r) => r.migration_name === row.migration_name && r.finished_at != null,
    );
    if (hasSuccess) {
      result.staleFailedDuplicates.push(row.migration_name);
    }
  }

  return result;
}

function loadLiveSchema(dbPath) {
  if (!dbPath) return { tables: null, columnsByTable: null };
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    const columnsByTable = new Map();
    for (const table of tables) {
      if (table.startsWith('sqlite_')) continue;
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
      columnsByTable.set(table, new Set(cols));
    }
    db.close();
    return { tables, columnsByTable };
  } catch {
    return { tables: null, columnsByTable: null };
  }
}

function main() {
  const migrations = listMigrationFolders();
  const dbPath = resolveSqliteDatabasePath();
  const { tables: liveTables, columnsByTable: liveColumnsByTable } = loadLiveSchema(dbPath);

  let db = null;
  if (dbPath) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(dbPath, { readOnly: true });
    } catch {
      db = null;
    }
  }

  const report = {
    migrationsDir,
    database: dbPath || null,
    migrationCount: migrations.length,
    sqliteIncompatible: auditSqliteIncompatible(migrations),
    duplicateColumnRisk: auditDuplicateColumns(migrations, liveColumnsByTable),
    missingTableRisk: auditMissingTables(migrations, liveTables),
    drift: auditMigrationDrift(migrations, db),
  };

  db?.close?.();

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== SQLite migration audit (read-only) ===');
  console.log(`Migrations scanned: ${report.migrationCount}`);
  console.log(`Database: ${report.database || '(none)'}`);
  console.log('');

  const sections = [
    ['A. SQLite-incompatible / risky SQL', report.sqliteIncompatible],
    ['B. Duplicate-column risk', report.duplicateColumnRisk],
    ['C. Missing-table dependency risk', report.missingTableRisk],
  ];

  for (const [title, items] of sections) {
    console.log(`--- ${title} (${items.length}) ---`);
    if (!items.length) {
      console.log('  (none)');
    } else {
      for (const item of items.slice(0, 40)) {
        console.log(`  [${item.migration}] ${item.detail}${item.table ? ` (${item.table}${item.column ? `.${item.column}` : ''})` : ''}`);
      }
      if (items.length > 40) console.log(`  ... and ${items.length - 40} more`);
    }
    console.log('');
  }

  console.log('--- D. Migration history drift ---');
  console.log(`  Failed migrations: ${report.drift.failed.length ? report.drift.failed.join(', ') : '(none)'}`);
  console.log(
    `  Stale failed duplicates (also applied successfully): ${
      report.drift.staleFailedDuplicates.length
        ? [...new Set(report.drift.staleFailedDuplicates)].join(', ')
        : '(none)'
    }`,
  );
  console.log(
    `  DB rows missing local folder: ${
      report.drift.dbMissingLocally.length ? report.drift.dbMissingLocally.join(', ') : '(none)'
    }`,
  );
  console.log(
    `  Local folders not applied: ${
      report.drift.localNotApplied.length ? report.drift.localNotApplied.join(', ') : '(none)'
    }`,
  );
}

main();
