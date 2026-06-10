#!/usr/bin/env node
/**
 * Mark sqlite migrations as applied when schema already matches (db push / partial apply drift).
 *
 * Usage:
 *   node scripts/sync-sqlite-migration-history.mjs --dry-run
 *   node scripts/sync-sqlite-migration-history.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import '../src/env/ensureDatabaseUrl.js';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'prisma', 'sqlite', 'migrations');
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

/** @type {Record<string, () => boolean>} */
const SCHEMA_CHECKS = {
  '20260610120000_add_discovery_pipeline': (db) => {
    const draft = new Set(db.prepare('PRAGMA table_info("DraftStore")').all().map((r) => r.name));
    if (!draft.has('unclaimedStoreId') || !draft.has('transferredAt')) return false;
    for (const table of ['UnclaimedStore', 'DiscoverySeedSource', 'DiscoveryBatchRun']) {
      const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!row) return false;
    }
    return true;
  },
  '20260610140000_add_discovery_config': (db) => {
    const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='discovery_config'").get();
    if (!row) return false;
    const seed = new Set(db.prepare('PRAGMA table_info("DiscoverySeedSource")').all().map((r) => r.name));
    return ['priority', 'batchLimit', 'lastError', 'errorCount'].every((c) => seed.has(c));
  },
};

function listDiskMigrations() {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function main() {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[sync-migration-history] DATABASE_URL must be SQLite file:');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const applied = new Set(
    db
      .prepare('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')
      .all()
      .map((r) => r.migration_name),
  );
  const failed = db
    .prepare(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
    )
    .all()
    .map((r) => r.migration_name);

  const candidates = listDiskMigrations().filter((name) => {
    if (applied.has(name)) return false;
    const check = SCHEMA_CHECKS[name];
    return check ? check(db) : false;
  });

  console.log('[sync-migration-history]', { dbPath, failed, candidates });

  if (!apply && !dryRun) {
    console.log('Pass --dry-run or --apply');
    db.close();
    return;
  }

  const now = Date.now();
  for (const name of candidates) {
    console.log(apply ? '[apply]' : '[dry-run]', name);
    if (!apply) continue;

    const existingFailed = db
      .prepare('SELECT 1 FROM _prisma_migrations WHERE migration_name = ? AND finished_at IS NULL')
      .get(name);
    if (existingFailed) {
      db.prepare(
        `UPDATE _prisma_migrations
         SET finished_at = ?, rolled_back_at = NULL, logs = NULL
         WHERE migration_name = ?`,
      ).run(now, name);
    } else {
      db.prepare(
        `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (?, '', ?, ?, NULL, NULL, ?, 1)`,
      ).run(cryptoRandomId(), now, name, now);
    }
  }

  db.close();
  console.log('[sync-migration-history] done');
}

function cryptoRandomId() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

main();
