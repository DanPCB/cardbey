'use strict';

const path = require('path');

const dbPath = path.join(__dirname, '..', 'prisma', 'test.db');

const TABLE_NAMES = ['Promotion', 'PromotionSlot', 'PromotionPlacement'];

const STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS "Promotion" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "storeId" TEXT,
      "type" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "message" TEXT,
      "mediaType" TEXT,
      "mediaUrl" TEXT,
      "ctaLabel" TEXT,
      "ctaUrl" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "startAt" DATETIME,
      "endAt" DATETIME,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `,
  `CREATE INDEX IF NOT EXISTS "Promotion_storeId_idx" ON "Promotion"("storeId")`,
  `CREATE INDEX IF NOT EXISTS "Promotion_status_idx" ON "Promotion"("status")`,
  `CREATE INDEX IF NOT EXISTS "Promotion_startAt_endAt_idx" ON "Promotion"("startAt","endAt")`,

  `
    CREATE TABLE IF NOT EXISTS "PromotionSlot" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "slotKey" TEXT NOT NULL,
      "surfaceType" TEXT NOT NULL,
      "displayMode" TEXT NOT NULL,
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "configJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PromotionSlot_slotKey_key" ON "PromotionSlot"("slotKey")`,
  `CREATE INDEX IF NOT EXISTS "PromotionSlot_slotKey_idx" ON "PromotionSlot"("slotKey")`,
  `CREATE INDEX IF NOT EXISTS "PromotionSlot_isActive_idx" ON "PromotionSlot"("isActive")`,

  `
    CREATE TABLE IF NOT EXISTS "PromotionPlacement" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "promotionId" TEXT NOT NULL,
      "slotId" TEXT NOT NULL,
      "storeId" TEXT,
      "enabled" INTEGER NOT NULL DEFAULT 1,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "startAt" DATETIME,
      "endAt" DATETIME,
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY ("slotId") REFERENCES "PromotionSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_promotionId_idx" ON "PromotionPlacement"("promotionId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_slotId_idx" ON "PromotionPlacement"("slotId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_storeId_idx" ON "PromotionPlacement"("storeId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_slotId_storeId_idx" ON "PromotionPlacement"("slotId","storeId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_enabled_idx" ON "PromotionPlacement"("enabled")`,
];

const STATEMENTS_NO_FK = [
  `
    CREATE TABLE IF NOT EXISTS "Promotion" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "storeId" TEXT,
      "type" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "message" TEXT,
      "mediaType" TEXT,
      "mediaUrl" TEXT,
      "ctaLabel" TEXT,
      "ctaUrl" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "startAt" DATETIME,
      "endAt" DATETIME,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `,
  `CREATE INDEX IF NOT EXISTS "Promotion_storeId_idx" ON "Promotion"("storeId")`,
  `CREATE INDEX IF NOT EXISTS "Promotion_status_idx" ON "Promotion"("status")`,
  `CREATE INDEX IF NOT EXISTS "Promotion_startAt_endAt_idx" ON "Promotion"("startAt","endAt")`,

  `
    CREATE TABLE IF NOT EXISTS "PromotionSlot" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "slotKey" TEXT NOT NULL,
      "surfaceType" TEXT NOT NULL,
      "displayMode" TEXT NOT NULL,
      "isActive" INTEGER NOT NULL DEFAULT 1,
      "configJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PromotionSlot_slotKey_key" ON "PromotionSlot"("slotKey")`,
  `CREATE INDEX IF NOT EXISTS "PromotionSlot_slotKey_idx" ON "PromotionSlot"("slotKey")`,
  `CREATE INDEX IF NOT EXISTS "PromotionSlot_isActive_idx" ON "PromotionSlot"("isActive")`,

  `
    CREATE TABLE IF NOT EXISTS "PromotionPlacement" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "promotionId" TEXT NOT NULL,
      "slotId" TEXT NOT NULL,
      "storeId" TEXT,
      "enabled" INTEGER NOT NULL DEFAULT 1,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "startAt" DATETIME,
      "endAt" DATETIME,
      "metadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_promotionId_idx" ON "PromotionPlacement"("promotionId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_slotId_idx" ON "PromotionPlacement"("slotId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_storeId_idx" ON "PromotionPlacement"("storeId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_slotId_storeId_idx" ON "PromotionPlacement"("slotId","storeId")`,
  `CREATE INDEX IF NOT EXISTS "PromotionPlacement_enabled_idx" ON "PromotionPlacement"("enabled")`,
];

function openAdapter() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    return {
      exec(sql) {
        db.exec(sql);
      },
      verify() {
        const inList = TABLE_NAMES.map(() => '?').join(',');
        return db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${inList}) ORDER BY name`,
          )
          .all(...TABLE_NAMES);
      },
      close() {
        db.close();
      },
    };
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND' && !/Cannot find module 'better-sqlite3'/i.test(e.message || '')) {
      throw e;
    }
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    return {
      exec(sql) {
        db.exec(sql);
      },
      verify() {
        const inList = TABLE_NAMES.map(() => '?').join(',');
        return [...db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${inList}) ORDER BY name`).all(...TABLE_NAMES)];
      },
      close() {
        db.close();
      },
    };
  }
}

function runAll(db, statements) {
  for (const sql of statements) {
    db.exec(sql.trim());
  }
}

const db = openAdapter();

try {
  runAll(db, STATEMENTS);
} catch (err) {
  const msg = err && err.message ? String(err.message) : String(err);
  if (
    msg.includes('FOREIGN KEY') ||
    msg.includes('foreign key') ||
    msg.includes('no such table') ||
    msg.includes('Promotion')
  ) {
    console.warn('[create-promotion-tables] FK path failed, retrying without FK constraints:', msg.slice(0, 200));
    runAll(db, STATEMENTS_NO_FK);
  } else {
    throw err;
  }
}

const tables = db.verify();
console.log('[create-promotion-tables] created:', tables.map((t) => t.name).join(', '));

db.close();
