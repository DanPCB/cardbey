#!/usr/bin/env node
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const dbPath = resolveSqliteDatabasePath();
const db = new DatabaseSync(dbPath, { readonly: true });
const draftCols = new Set(db.prepare('PRAGMA table_info("DraftStore")').all().map((r) => r.name));
console.log('DraftStore.unclaimedStoreId', draftCols.has('unclaimedStoreId'));
console.log('DraftStore.transferredAt', draftCols.has('transferredAt'));
for (const table of ['UnclaimedStore', 'DiscoverySeedSource', 'DiscoveryBatchRun', 'discovery_config']) {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  console.log(`table ${table}`, Boolean(row));
}
const unclaimedCols = new Set(db.prepare('PRAGMA table_info("UnclaimedStore")').all().map((r) => r.name));
for (const col of ['phone', 'email', 'address', 'hours', 'priceRange', 'websiteUrl']) {
  console.log(`UnclaimedStore.${col}`, unclaimedCols.has(col));
}
const seedCols = new Set(db.prepare('PRAGMA table_info("DiscoverySeedSource")').all().map((r) => r.name));
for (const col of ['priority', 'batchLimit', 'lastError', 'errorCount']) {
  console.log(`DiscoverySeedSource.${col}`, seedCols.has(col));
}
const migrations = db
  .prepare(
    `SELECT migration_name, finished_at, rolled_back_at
     FROM _prisma_migrations
     WHERE migration_name LIKE '202606101%'
     ORDER BY migration_name`,
  )
  .all();
console.log('migrations', migrations);
db.close();
