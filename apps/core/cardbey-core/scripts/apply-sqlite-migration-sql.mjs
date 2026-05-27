#!/usr/bin/env node
/**
 * Apply SQL from an existing prisma/migrations/<name>/migration.sql file
 * when optional guards pass. Does not create new migrations.
 *
 * Usage:
 *   node scripts/apply-sqlite-migration-sql.mjs 20260527120000_add_publish_snapshot \
 *     --guard-column=publishSnapshotVersion --table=DraftStore
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { inspectSqliteDatabase, resolveSqliteDatabasePath, toFileUrl, CANONICAL_DEV_DB } from '../src/lib/sqliteDbPath.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), override: true });
if (!process.env.DATABASE_URL?.startsWith('file:')) {
  process.env.DATABASE_URL = 'file:../dev.db';
}
process.env.DATABASE_URL = toFileUrl(
  resolveSqliteDatabasePath(process.env.DATABASE_URL.replace(/\?.*$/, '')) || CANONICAL_DEV_DB,
);
const migrationName = process.argv[2];
if (!migrationName) {
  console.error('Usage: node scripts/apply-sqlite-migration-sql.mjs <migration_folder_name> [--guard-column=col] [--table=DraftStore]');
  process.exit(1);
}

const guardArg = process.argv.find((a) => a.startsWith('--guard-column='));
const tableArg = process.argv.find((a) => a.startsWith('--table='));
const guardColumn = guardArg?.split('=')[1];
const table = tableArg?.split('=')[1] || 'DraftStore';

const dbPath = resolveSqliteDatabasePath();
if (!dbPath) {
  console.error('[apply-sqlite-migration-sql] DATABASE_URL must be SQLite file:');
  process.exit(1);
}

const sqlPath = path.join(root, 'prisma', 'migrations', migrationName, 'migration.sql');
if (!fs.existsSync(sqlPath)) {
  console.error('[apply-sqlite-migration-sql] Missing', sqlPath);
  process.exit(1);
}

const inspect = inspectSqliteDatabase(dbPath);
if (guardColumn && inspect.draftStoreColumns?.includes(guardColumn)) {
  console.log(`[apply-sqlite-migration-sql] ${table}.${guardColumn} already present — skip ${migrationName}`);
  process.exit(0);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new DatabaseSync(dbPath);
try {
  db.exec(sql);
  console.log(`[apply-sqlite-migration-sql] Applied ${migrationName} to ${dbPath}`);
} catch (e) {
  console.error('[apply-sqlite-migration-sql] Failed:', e?.message || e);
  process.exit(1);
} finally {
  db.close();
}
