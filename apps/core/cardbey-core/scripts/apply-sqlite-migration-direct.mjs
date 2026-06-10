#!/usr/bin/env node
/**
 * Apply one sqlite migration SQL file directly and record history (when migrate deploy is locked).
 * Skips ADD COLUMN when the column already exists (db push drift).
 *
 * Usage: node scripts/apply-sqlite-migration-direct.mjs 20260610160000_add_unclaimed_store_website_fields
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import '../src/env/ensureDatabaseUrl.js';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/apply-sqlite-migration-direct.mjs <migration_folder_name>');
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = path.join(root, 'prisma', 'sqlite', 'migrations', name, 'migration.sql');
const dbPath = resolveSqliteDatabasePath();

if (!fs.existsSync(sqlPath)) {
  console.error('[apply-direct] missing', sqlPath);
  process.exit(1);
}

const ADD_COLUMN_RE =
  /^ALTER TABLE "([^"]+)" ADD COLUMN(?: IF NOT EXISTS)? "([^"]+)"\s*(.*)$/i;

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
}

function execStatement(db, stmt) {
  const addCol = stmt.match(ADD_COLUMN_RE);
  if (addCol) {
    const [, table, column] = addCol;
    if (tableColumns(db, table).has(column)) {
      console.log('[apply-direct] skip existing column', `${table}.${column}`);
      return;
    }
  }
  db.exec(stmt);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new DatabaseSync(dbPath);
try {
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    execStatement(db, stmt);
  }
  const now = Date.now();
  const done = db
    .prepare('SELECT finished_at FROM _prisma_migrations WHERE migration_name = ?')
    .get(name);
  if (!done?.finished_at) {
    const failed = db
      .prepare(
        'SELECT 1 AS ok FROM _prisma_migrations WHERE migration_name = ? AND finished_at IS NULL',
      )
      .get(name);
    if (failed) {
      db.prepare(
        `UPDATE _prisma_migrations
         SET finished_at = ?, rolled_back_at = NULL, logs = NULL
         WHERE migration_name = ?`,
      ).run(now, name);
    } else {
      db.prepare(
        `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (?, '', ?, ?, NULL, NULL, ?, 1)`,
      ).run(`manual-${now}`, now, name, now);
    }
  }
  console.log('[apply-direct] ok', { name, dbPath });
} finally {
  db.close();
}
