#!/usr/bin/env node
/**
 * Idempotent: create performer_session_contexts on legacy SQLite DBs.
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
    '20260625140000_add_performer_session_context',
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
      '[ensure-performer-session-context-table] postgres — apply prisma migrate deploy (20260625140000_add_performer_session_context)',
    );
    return;
  }

  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-performer-session-context-table] DATABASE_URL must be SQLite file:');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const hadTable = tableExists(db, 'performer_session_contexts');

  if (!hadTable) {
    db.exec(MIGRATION_SQL);
  }

  db.close();
  console.log('[ensure-performer-session-context-table] ok', {
    dbPath,
    created: { performer_session_contexts: !hadTable },
  });
}

main();
