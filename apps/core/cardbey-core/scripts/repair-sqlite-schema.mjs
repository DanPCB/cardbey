#!/usr/bin/env node
/**
 * Idempotent SQLite schema repair for local dev drift.
 * Uses PRAGMA table_info / sqlite_master — never blindly marks Prisma migrations applied.
 *
 * Usage:
 *   node scripts/repair-sqlite-schema.mjs
 *   node scripts/repair-sqlite-schema.mjs --cleanup-failed-duplicates
 */
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';
import {
  findTablesWithTimestamp3,
  repairAllTimestamp3Columns,
} from '../src/lib/sqliteTimestampRepair.js';
import {
  PRODUCT_COLUMN_REPAIRS,
  PUBLISHED_ARTIFACT_PROJECTION_COLUMN_REPAIRS,
  PRODUCT_INDEX_DDL,
  SMART_DOCUMENT_TABLES,
  SMART_DOCUMENT_INDEX_DDL,
  LOYALTY_PROGRAM_STAMP_INDEX_DDL,
  repairLoyaltyProgramStampTable,
  ensureDocumentLoyaltyStampTable,
} from '../src/lib/sqliteSchemaRepairDefinitions.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const cleanupFailedDuplicates = process.argv.includes('--cleanup-failed-duplicates');

const COLUMN_REPAIRS = [
  ...PRODUCT_COLUMN_REPAIRS,
  ...PUBLISHED_ARTIFACT_PROJECTION_COLUMN_REPAIRS,
  { table: 'DraftStore', name: 'unclaimedStoreId', ddl: 'ALTER TABLE "DraftStore" ADD COLUMN "unclaimedStoreId" TEXT' },
  { table: 'DraftStore', name: 'transferredAt', ddl: 'ALTER TABLE "DraftStore" ADD COLUMN "transferredAt" DATETIME' },
  { table: 'DiscoverySeedSource', name: 'priority', ddl: 'ALTER TABLE "DiscoverySeedSource" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0' },
  { table: 'DiscoverySeedSource', name: 'batchLimit', ddl: 'ALTER TABLE "DiscoverySeedSource" ADD COLUMN "batchLimit" INTEGER' },
  { table: 'DiscoverySeedSource', name: 'lastError', ddl: 'ALTER TABLE "DiscoverySeedSource" ADD COLUMN "lastError" TEXT' },
  { table: 'DiscoverySeedSource', name: 'errorCount', ddl: 'ALTER TABLE "DiscoverySeedSource" ADD COLUMN "errorCount" INTEGER NOT NULL DEFAULT 0' },
  { table: 'DiscoveryBatchRun', name: 'triggeredBy', ddl: 'ALTER TABLE "DiscoveryBatchRun" ADD COLUMN "triggeredBy" TEXT' },
  { table: 'DiscoveryBatchRun', name: 'triggeredById', ddl: 'ALTER TABLE "DiscoveryBatchRun" ADD COLUMN "triggeredById" TEXT' },
  { table: 'DiscoveryBatchRun', name: 'configSnapshot', ddl: 'ALTER TABLE "DiscoveryBatchRun" ADD COLUMN "configSnapshot" TEXT' },
  { table: 'Business', name: 'heroImageUrl', ddl: 'ALTER TABLE "Business" ADD COLUMN "heroImageUrl" TEXT' },
  { table: 'Business', name: 'avatarImageUrl', ddl: 'ALTER TABLE "Business" ADD COLUMN "avatarImageUrl" TEXT' },
  { table: 'Business', name: 'publishedAt', ddl: 'ALTER TABLE "Business" ADD COLUMN "publishedAt" DATETIME' },
  { table: 'SkillDispatchLog', name: 'query', ddl: 'ALTER TABLE "SkillDispatchLog" ADD COLUMN "query" TEXT NOT NULL DEFAULT \'\'' },
];

const TABLE_DDL = [
  {
    name: 'SkillDispatchLog',
    sql: `CREATE TABLE IF NOT EXISTS "SkillDispatchLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "traceId" TEXT NOT NULL,
      "userId" TEXT,
      "sessionId" TEXT,
      "query" TEXT NOT NULL DEFAULT '',
      "intent" TEXT NOT NULL,
      "matchedSkill" TEXT,
      "confidence" REAL NOT NULL,
      "executionPath" TEXT,
      "outcome" TEXT,
      "latencyMs" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'SkillDispatchFeedback',
    sql: `CREATE TABLE IF NOT EXISTS "SkillDispatchFeedback" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "dispatchLogId" TEXT NOT NULL,
      "userId" TEXT,
      "rating" INTEGER NOT NULL,
      "correctionText" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SkillDispatchFeedback_dispatchLogId_fkey" FOREIGN KEY ("dispatchLogId") REFERENCES "SkillDispatchLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: 'discovery_config',
    sql: `CREATE TABLE IF NOT EXISTS "discovery_config" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "cronExpression" TEXT NOT NULL DEFAULT '0 */6 * * *',
      "batchSize" INTEGER NOT NULL DEFAULT 20,
      "concurrency" INTEGER NOT NULL DEFAULT 3,
      "delayMs" INTEGER NOT NULL DEFAULT 2000,
      "maxRunsPerDay" INTEGER NOT NULL DEFAULT 4,
      "pausedUntil" DATETIME,
      "updatedAt" DATETIME NOT NULL,
      "updatedBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'intelligence_override',
    sql: `CREATE TABLE IF NOT EXISTS "intelligence_override" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "overridesJson" TEXT NOT NULL DEFAULT '{}',
      "updatedAt" DATETIME NOT NULL,
      "updatedBy" TEXT
    )`,
  },
  {
    name: 'PilEvent',
    sql: `CREATE TABLE IF NOT EXISTS "PilEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "sessionId" TEXT,
      "userId" TEXT,
      "entityType" TEXT,
      "entityId" TEXT,
      "storeId" TEXT,
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
];

const INDEX_DDL = [
  'CREATE INDEX IF NOT EXISTS "DraftStore_unclaimedStoreId_idx" ON "DraftStore"("unclaimedStoreId")',
  'CREATE INDEX IF NOT EXISTS "DiscoverySeedSource_priority_idx" ON "DiscoverySeedSource"("priority")',
  'CREATE INDEX IF NOT EXISTS "SkillDispatchLog_userId_createdAt_idx" ON "SkillDispatchLog"("userId", "createdAt")',
  'CREATE INDEX IF NOT EXISTS "SkillDispatchLog_intent_confidence_idx" ON "SkillDispatchLog"("intent", "confidence")',
  'CREATE INDEX IF NOT EXISTS "SkillDispatchLog_createdAt_idx" ON "SkillDispatchLog"("createdAt")',
  'CREATE INDEX IF NOT EXISTS "SkillDispatchLog_traceId_idx" ON "SkillDispatchLog"("traceId")',
  'CREATE INDEX IF NOT EXISTS "SkillDispatchFeedback_dispatchLogId_idx" ON "SkillDispatchFeedback"("dispatchLogId")',
  'CREATE INDEX IF NOT EXISTS "SkillDispatchFeedback_userId_idx" ON "SkillDispatchFeedback"("userId")',
  'CREATE INDEX IF NOT EXISTS "PilEvent_type_timestamp_idx" ON "PilEvent"("type", "timestamp")',
  'CREATE INDEX IF NOT EXISTS "PilEvent_sessionId_idx" ON "PilEvent"("sessionId")',
  'CREATE INDEX IF NOT EXISTS "PilEvent_userId_idx" ON "PilEvent"("userId")',
  'CREATE INDEX IF NOT EXISTS "PilEvent_storeId_timestamp_idx" ON "PilEvent"("storeId", "timestamp")',
  'CREATE INDEX IF NOT EXISTS "PilEvent_entityType_entityId_idx" ON "PilEvent"("entityType", "entityId")',
];

function tableExists(db, table) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),
  );
}

function tableColumns(db, table) {
  if (!tableExists(db, table)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
}

function indexExists(db, indexName) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(indexName),
  );
}

function extractIndexName(ddl) {
  const m = ddl.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i);
  return m?.[1] || null;
}

function cleanupStaleFailedMigrationRows(db) {
  const failed = db
    .prepare(
      `SELECT id, migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NOT NULL`,
    )
    .all();
  const rolledBack = [];
  for (const row of failed) {
    const success = db
      .prepare(
        `SELECT 1 FROM _prisma_migrations
         WHERE migration_name = ? AND finished_at IS NOT NULL`,
      )
      .get(row.migration_name);
    if (success) {
      db.prepare('UPDATE _prisma_migrations SET rolled_back_at = ? WHERE id = ?').run(
        Date.now(),
        row.id,
      );
      rolledBack.push(row.migration_name);
    }
  }
  return rolledBack;
}

function backupDatabase(dbPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.backup-before-ts-repair-${stamp}`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function main() {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[repair-sqlite-schema] DATABASE_URL must be a SQLite file: URL');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const summary = {
    dbPath,
    backupPath: null,
    tablesCreated: [],
    columnsAdded: [],
    indexesEnsured: [],
    timestampTablesRepaired: [],
    loyaltyTablesRepaired: [],
    staleFailedRowsRolledBack: [],
  };

  const tablesNeedingTimestampRepair = findTablesWithTimestamp3(db);
  if (tablesNeedingTimestampRepair.length > 0) {
    db.close();
    summary.backupPath = backupDatabase(dbPath);
    const repairDb = new DatabaseSync(dbPath);
    summary.timestampTablesRepaired = repairAllTimestamp3Columns(repairDb);
    repairDb.close();
    console.warn(
      '[repair-sqlite-schema] repaired TIMESTAMP(3) columns on:',
      summary.timestampTablesRepaired,
      'backup:',
      summary.backupPath,
    );
  }

  const dbAfterRepair = new DatabaseSync(dbPath);

  const loyaltyRepair = repairLoyaltyProgramStampTable(
    dbAfterRepair,
    (name) => tableExists(dbAfterRepair, name),
    (name) => tableColumns(dbAfterRepair, name),
  );
  if (loyaltyRepair) summary.loyaltyTablesRepaired.push(loyaltyRepair);

  for (const table of TABLE_DDL) {
    if (tableExists(dbAfterRepair, table.name)) continue;
    dbAfterRepair.exec(table.sql);
    summary.tablesCreated.push(table.name);
  }

  for (const table of SMART_DOCUMENT_TABLES) {
    if (table.name === 'LoyaltyStamp') continue;
    if (tableExists(dbAfterRepair, table.name)) continue;
    dbAfterRepair.exec(table.sql);
    summary.tablesCreated.push(table.name);
  }

  const docLoyaltyRepair = ensureDocumentLoyaltyStampTable(
    dbAfterRepair,
    (name) => tableExists(dbAfterRepair, name),
    (name) => tableColumns(dbAfterRepair, name),
  );
  if (docLoyaltyRepair) summary.tablesCreated.push(docLoyaltyRepair);

  for (const repair of COLUMN_REPAIRS) {
    if (!tableExists(dbAfterRepair, repair.table)) continue;
    const cols = tableColumns(dbAfterRepair, repair.table);
    if (cols.has(repair.name)) continue;
    dbAfterRepair.exec(repair.ddl);
    summary.columnsAdded.push(`${repair.table}.${repair.name}`);
  }

  for (const ddl of [...INDEX_DDL, ...PRODUCT_INDEX_DDL, ...LOYALTY_PROGRAM_STAMP_INDEX_DDL, ...SMART_DOCUMENT_INDEX_DDL]) {
    const indexName = extractIndexName(ddl);
    if (indexName && indexExists(dbAfterRepair, indexName)) continue;
    try {
      dbAfterRepair.exec(ddl);
      if (indexName) summary.indexesEnsured.push(indexName);
    } catch (err) {
      console.warn(`[repair-sqlite-schema] index skipped (${indexName || ddl}):`, err.message);
    }
  }

  if (cleanupFailedDuplicates && tableExists(dbAfterRepair, '_prisma_migrations')) {
    summary.staleFailedRowsRolledBack = cleanupStaleFailedMigrationRows(dbAfterRepair);
  }

  dbAfterRepair.close();
  console.log('[repair-sqlite-schema] ok', summary);
}

main();
