#!/usr/bin/env node
/**
 * Idempotent: create MissionPipeline / MissionPipelineStep / MissionContext on legacy SQLite DBs
 * that skipped migrate deploy (PRISMA_SKIP_MIGRATE_DEPLOY=1) or predated the sqlite migration.
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
    '20260314150000_add_mission_pipeline',
    'migration.sql',
  ),
  'utf8',
);

function tableExists(db, name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
  return Boolean(row?.name);
}

function main() {
  const dbUrl = pickDatabaseUrlForPrisma();
  if (isPostgresDatabaseUrl(dbUrl)) {
    console.log(
      '[ensure-mission-pipeline-tables] postgres — apply prisma migrate deploy (20260314150000_add_mission_pipeline)',
    );
    return;
  }

  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-mission-pipeline-tables] DATABASE_URL must be SQLite file:');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const hadPipeline = tableExists(db, 'MissionPipeline');
  const hadStep = tableExists(db, 'MissionPipelineStep');
  const hadContext = tableExists(db, 'MissionContext');

  if (!hadPipeline || !hadStep || !hadContext) {
    db.exec(MIGRATION_SQL);
  }

  db.close();
  console.log('[ensure-mission-pipeline-tables] ok', {
    dbPath,
    created: {
      MissionPipeline: !hadPipeline,
      MissionPipelineStep: !hadStep,
      MissionContext: !hadContext,
    },
  });
}

main();
