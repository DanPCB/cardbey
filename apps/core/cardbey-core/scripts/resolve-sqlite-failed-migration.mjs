#!/usr/bin/env node
/**
 * Clear P3009 failed migration rows that block migrate deploy.
 *
 * Usage:
 *   node scripts/resolve-sqlite-failed-migration.mjs
 *   node scripts/resolve-sqlite-failed-migration.mjs --applied
 *   node scripts/resolve-sqlite-failed-migration.mjs --name=20260126014706_mi_orchestrator_store_multi_and_smartobject
 */
import '../src/env/ensureDatabaseUrl.js';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';
import { resolvePrismaSchemaPath } from './prismaSchemaPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const root = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = resolvePrismaSchemaPath(path.join(root, '..'));
const nameArg = process.argv.find((a) => a.startsWith('--name='));
const useApplied = process.argv.includes('--applied');
const mode = useApplied ? 'applied' : 'rolled-back';

const dbPath = resolveSqliteDatabasePath();
if (!dbPath) {
  console.error('[resolve-failed] DATABASE_URL must be a SQLite file: URL');
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readonly: true });
const failed = db
  .prepare(
    `SELECT migration_name FROM _prisma_migrations
     WHERE finished_at IS NULL AND rolled_back_at IS NULL
     ORDER BY started_at`,
  )
  .all()
  .map((row) => row.migration_name);
db.close();

const targets = nameArg ? [nameArg.split('=')[1]] : failed;
if (targets.length === 0) {
  console.log('[resolve-failed] no failed migrations in', dbPath);
  process.exit(0);
}

function resolveWithSql(migrationName, sqlMode) {
  const db = new DatabaseSync(dbPath);
  try {
    const now = Date.now();
    if (sqlMode === 'applied') {
      db.prepare(
        `UPDATE _prisma_migrations
         SET finished_at = ?, rolled_back_at = NULL, logs = NULL
         WHERE migration_name = ? AND finished_at IS NULL`,
      ).run(now, migrationName);
    } else {
      db.prepare(
        `UPDATE _prisma_migrations
         SET rolled_back_at = ?, logs = NULL
         WHERE migration_name = ? AND finished_at IS NULL AND rolled_back_at IS NULL`,
      ).run(now, migrationName);
    }
    const row = db
      .prepare('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = ?')
      .get(migrationName);
    console.log('[resolve-failed] sql ok', row);
  } finally {
    db.close();
  }
}

const forceSql = process.argv.includes('--sql');

for (const name of targets) {
  if (!name) continue;
  if (forceSql) {
    resolveWithSql(name, mode);
    continue;
  }
  const cmd = `npx prisma migrate resolve --${mode} ${name} --schema=${schemaPath}`;
  console.log('[resolve-failed]', cmd);
  try {
    execSync(cmd, { stdio: 'inherit', env: process.env, shell: true });
  } catch (error) {
    const msg = String(error?.message || error);
    if (msg.includes('database is locked') || msg.includes('SQLITE_BUSY')) {
      console.warn('[resolve-failed] prisma locked — retry with direct SQL (stop Core first if this fails)');
      resolveWithSql(name, mode);
      continue;
    }
    throw error;
  }
}

console.log('[resolve-failed] done — run: npx prisma migrate deploy --schema', schemaPath);
