/**
 * Record a migration as applied in _prisma_migrations (when migrate deploy cannot get a write lock).
 * Usage: node scripts/record-sqlite-migration.mjs <migration_folder_name>
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import '../src/env/ensureDatabaseUrl.js';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.join(__dirname, '..');

function checksumForMigration(migrationName) {
  const sqlPath = path.join(
    coreRoot,
    'prisma/sqlite/migrations',
    migrationName,
    'migration.sql',
  );
  const content = fs.readFileSync(sqlPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function recordMigration(db, migrationName) {
  const existing = db
    .prepare('SELECT finished_at FROM _prisma_migrations WHERE migration_name = ?')
    .get(migrationName);
  if (existing?.finished_at != null) {
    console.log(`[record-migration] already applied: ${migrationName}`);
    return;
  }
  if (existing && existing.finished_at == null) {
    const now = Date.now();
    const checksum = checksumForMigration(migrationName);
    db.prepare(
      `UPDATE _prisma_migrations
       SET finished_at = ?, logs = NULL, checksum = ?, applied_steps_count = 1
       WHERE migration_name = ? AND finished_at IS NULL`,
    ).run(now, checksum, migrationName);
    console.log(`[record-migration] resolved failed row: ${migrationName}`);
    return;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const checksum = checksumForMigration(migrationName);
  db.prepare(
    `INSERT INTO _prisma_migrations
     (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
  ).run(id, checksum, now, migrationName, now);
  console.log(`[record-migration] inserted: ${migrationName}`);
}

const names = process.argv.slice(2);
if (!names.length) {
  console.error('Usage: node scripts/record-sqlite-migration.mjs <migration_name> [...]');
  process.exit(1);
}

const dbPath = resolveSqliteDatabasePath(process.env.DATABASE_URL);
if (!dbPath) {
  console.error('[record-migration] DATABASE_URL must be a SQLite file: URL');
  process.exit(1);
}
const db = new DatabaseSync(dbPath);
try {
  for (const name of names) {
    recordMigration(db, name);
  }
} finally {
  db.close();
}
