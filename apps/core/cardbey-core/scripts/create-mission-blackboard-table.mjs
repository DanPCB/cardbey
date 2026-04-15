/**
 * Creates MissionBlackboard SQLite table without prisma db push (avoids destructive sync).
 * DDL matches prisma/sqlite/schema.prisma model MissionBlackboard.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dbPath = path.join(__dirname, '../prisma/test.db');

function createBlackboardSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "MissionBlackboard" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "missionId" TEXT NOT NULL,
      "seq" INTEGER NOT NULL,
      "eventType" TEXT NOT NULL,
      "payload" TEXT NOT NULL DEFAULT '{}',
      "agentId" TEXT,
      "correlationId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_key"
    ON "MissionBlackboard"("missionId", "seq");
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_idx"
    ON "MissionBlackboard"("missionId", "seq");
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_createdAt_idx"
    ON "MissionBlackboard"("missionId", "createdAt");
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS "MissionBlackboard_correlationId_idx"
    ON "MissionBlackboard"("correlationId");
  `);
}

try {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  createBlackboardSchema(db);
  console.log('MissionBlackboard table created successfully');
  db.close();
} catch (err) {
  if (err && err.code === 'MODULE_NOT_FOUND') {
    console.log('better-sqlite3 not available, trying prisma $executeRawUnsafe');

    const { getPrismaClient } = await import('../src/db/prisma.js');
    const prisma = getPrismaClient();

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MissionBlackboard" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "missionId" TEXT NOT NULL,
        "seq" INTEGER NOT NULL,
        "eventType" TEXT NOT NULL,
        "payload" TEXT NOT NULL DEFAULT '{}',
        "agentId" TEXT,
        "correlationId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_key"
      ON "MissionBlackboard"("missionId", "seq");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_idx"
      ON "MissionBlackboard"("missionId", "seq");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_createdAt_idx"
      ON "MissionBlackboard"("missionId", "createdAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MissionBlackboard_correlationId_idx"
      ON "MissionBlackboard"("correlationId");
    `);

    console.log('MissionBlackboard table created via prisma');
    await prisma.$disconnect();
  } else {
    throw err;
  }
}
