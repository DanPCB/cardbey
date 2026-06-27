#!/usr/bin/env node
/**
 * Idempotent: add Business commerce + guest draft columns when missing (SQLite).
 */
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const COLUMNS = [
  { name: 'transactionMode', ddl: 'ALTER TABLE "Business" ADD COLUMN "transactionMode" TEXT NOT NULL DEFAULT \'order\'' },
  { name: 'catalogLabel', ddl: 'ALTER TABLE "Business" ADD COLUMN "catalogLabel" TEXT NOT NULL DEFAULT \'Products\'' },
  { name: 'ctaLabel', ddl: 'ALTER TABLE "Business" ADD COLUMN "ctaLabel" TEXT NOT NULL DEFAULT \'Order now\'' },
  { name: 'isGuestDraft', ddl: 'ALTER TABLE "Business" ADD COLUMN "isGuestDraft" INTEGER NOT NULL DEFAULT 0' },
  { name: 'expiresAt', ddl: 'ALTER TABLE "Business" ADD COLUMN "expiresAt" DATETIME' },
];

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
}

function main() {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-business-commerce-columns] DATABASE_URL must be a SQLite file: URL');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const existing = tableColumns(db, 'Business');
  const added = [];

  for (const col of COLUMNS) {
    if (existing.has(col.name)) continue;
    db.exec(col.ddl);
    added.push(col.name);
  }

  db.close();
  console.log('[ensure-business-commerce-columns] ok', { dbPath, added });
}

main();
