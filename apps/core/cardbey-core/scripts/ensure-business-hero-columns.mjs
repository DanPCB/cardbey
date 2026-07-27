#!/usr/bin/env node
/**
 * Idempotent: add Business.heroImageUrl / avatarImageUrl / publishedAt when missing.
 * For legacy SQLite DBs created before migrate history included these columns.
 */
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const COLUMNS = [
  { name: 'heroImageUrl', ddl: 'ALTER TABLE "Business" ADD COLUMN "heroImageUrl" TEXT' },
  { name: 'avatarImageUrl', ddl: 'ALTER TABLE "Business" ADD COLUMN "avatarImageUrl" TEXT' },
  { name: 'publishedAt', ddl: 'ALTER TABLE "Business" ADD COLUMN "publishedAt" DATETIME' },
];

function tableColumns(db, table) {
  return new Set(
    db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name),
  );
}

function main() {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-business-hero-columns] DATABASE_URL must be a SQLite file: URL');
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
  console.log('[ensure-business-hero-columns] ok', { dbPath, added });
}

main();
