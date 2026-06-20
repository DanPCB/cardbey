#!/usr/bin/env node
/**
 * Idempotent: create business_seed (+ discovery_engine_job) tables on legacy SQLite DBs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';
import { isPostgresDatabaseUrl, pickDatabaseUrlForPrisma } from './prismaSchemaPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'prisma',
    'sqlite',
    'migrations',
    '20260619120000_add_business_seed_table',
    'migration.sql',
  ),
  'utf8',
);

const INGESTION_RUN_MIGRATION_SQL = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'prisma',
    'sqlite',
    'migrations',
    '20260620120000_add_business_ingestion_run',
    'migration.sql',
  ),
  'utf8',
);

const STATUS_TRANSITION_MIGRATION_SQL = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'prisma',
    'sqlite',
    'migrations',
    '20260621120000_add_business_seed_status_transition',
    'migration.sql',
  ),
  'utf8',
);

function tableExists(db, name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return Boolean(row?.name);
}

function main() {
  const dbUrl = pickDatabaseUrlForPrisma();
  if (isPostgresDatabaseUrl(dbUrl)) {
    console.log(
      '[ensure-business-seed-table] postgres — apply prisma migrate deploy (20260619120000_add_business_seed_table, 20260620120000_add_business_ingestion_run, 20260621120000_add_business_seed_status_transition)',
    );
    return;
  }

  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-business-seed-table] DATABASE_URL must be SQLite file:');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const hadBusinessSeed = tableExists(db, 'business_seed');
  const hadDiscoveryJob = tableExists(db, 'discovery_engine_job');
  const hadIngestionRun = tableExists(db, 'business_ingestion_run');
  const hadStatusTransition = tableExists(db, 'business_seed_status_transition');

  if (!hadBusinessSeed || !hadDiscoveryJob) {
    db.exec(MIGRATION_SQL);
  }

  if (!hadIngestionRun) {
    db.exec(INGESTION_RUN_MIGRATION_SQL);
  }

  if (!hadStatusTransition) {
    db.exec(STATUS_TRANSITION_MIGRATION_SQL);
  }

  db.close();
  console.log('[ensure-business-seed-table] ok', {
    dbPath,
    created: {
      business_seed: !hadBusinessSeed,
      discovery_engine_job: !hadDiscoveryJob,
      business_ingestion_run: !hadIngestionRun,
      business_seed_status_transition: !hadStatusTransition,
    },
  });
}

main();
