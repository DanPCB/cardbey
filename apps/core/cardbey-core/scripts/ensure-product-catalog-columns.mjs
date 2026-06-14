#!/usr/bin/env node
/**
 * Idempotent: add Product catalog commerce columns when missing on legacy SQLite DBs.
 * Matches prisma/sqlite/migrations/20260611120000_product_catalog_item_type.
 */
import '../src/env/ensureDatabaseUrl.js';
import { createRequire } from 'node:module';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const COLUMNS = [
  { name: 'itemType', ddl: 'ALTER TABLE "Product" ADD COLUMN "itemType" TEXT' },
  { name: 'bookingEnabled', ddl: 'ALTER TABLE "Product" ADD COLUMN "bookingEnabled" BOOLEAN' },
  { name: 'purchaseEnabled', ddl: 'ALTER TABLE "Product" ADD COLUMN "purchaseEnabled" BOOLEAN' },
  { name: 'primaryAction', ddl: 'ALTER TABLE "Product" ADD COLUMN "primaryAction" TEXT' },
];

function tableColumns(db) {
  return new Set(db.prepare('PRAGMA table_info("Product")').all().map((row) => row.name));
}

function main() {
  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    console.error('[ensure-product-catalog-columns] DATABASE_URL must be SQLite file:');
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
  console.log('[ensure-product-catalog-columns] ok', { dbPath, added });
}

main();
