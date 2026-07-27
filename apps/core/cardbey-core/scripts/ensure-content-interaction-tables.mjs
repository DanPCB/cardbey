#!/usr/bin/env node
/**
 * Idempotent: create ContentInteraction* tables when missing on legacy SQLite DBs.
 * Matches prisma/sqlite/migrations/20260612200000_add_content_interaction_metrics.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

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
    '20260612200000_add_content_interaction_metrics',
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
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-content-interaction-tables] DATABASE_URL must be SQLite file:');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const hadMetrics = tableExists(db, 'ContentInteractionMetrics');
  const hadViewer = tableExists(db, 'ContentInteractionViewerState');

  if (!hadMetrics || !hadViewer) {
    db.exec(MIGRATION_SQL);
  }

  db.close();
  console.log('[ensure-content-interaction-tables] ok', {
    dbPath,
    created: {
      ContentInteractionMetrics: !hadMetrics,
      ContentInteractionViewerState: !hadViewer,
    },
  });
}

main();
