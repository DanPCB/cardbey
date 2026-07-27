#!/usr/bin/env node
/**
 * Idempotent: add common Business public-read columns when missing on legacy SQLite DBs.
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
  { name: 'storefrontSettings', ddl: 'ALTER TABLE "Business" ADD COLUMN "storefrontSettings" JSONB' },
  { name: 'socialLinks', ddl: 'ALTER TABLE "Business" ADD COLUMN "socialLinks" JSONB' },
  {
    name: 'showOwnerProfile',
    ddl: 'ALTER TABLE "Business" ADD COLUMN "showOwnerProfile" BOOLEAN NOT NULL DEFAULT 0',
  },
  { name: 'brandTone', ddl: 'ALTER TABLE "Business" ADD COLUMN "brandTone" TEXT' },
  { name: 'brandStyle', ddl: 'ALTER TABLE "Business" ADD COLUMN "brandStyle" TEXT' },
  { name: 'brandColors', ddl: 'ALTER TABLE "Business" ADD COLUMN "brandColors" TEXT' },
];

function tableColumns(db) {
  return new Set(db.prepare('PRAGMA table_info("Business")').all().map((row) => row.name));
}

function main() {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-business-public-columns] DATABASE_URL must be SQLite file:');
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const existing = tableColumns(db);
  const added = [];

  for (const col of COLUMNS) {
    if (existing.has(col.name)) continue;
    db.exec(col.ddl);
    added.push(col.name);
  }

  db.close();
  console.log('[ensure-business-public-columns] ok', { dbPath, added });
}

main();
