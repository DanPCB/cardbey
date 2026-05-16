'use strict';

const path = require('path');

const dbPath = path.join(__dirname, '..', 'prisma', 'test.db');

const SQL_CREATE_WITH_FK = `
  CREATE TABLE IF NOT EXISTS "MissionBlackboard" (
    "id"            TEXT     NOT NULL PRIMARY KEY,
    "missionId"     TEXT     NOT NULL,
    "seq"           INTEGER  NOT NULL,
    "eventType"     TEXT     NOT NULL,
    "payload"       TEXT     NOT NULL DEFAULT '{}',
    "agentId"       TEXT,
    "correlationId" TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionBlackboard_missionId_fkey"
      FOREIGN KEY ("missionId") REFERENCES "Mission" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )
`;

const SQL_CREATE_NO_FK = `
  CREATE TABLE IF NOT EXISTS "MissionBlackboard" (
    "id"            TEXT     NOT NULL PRIMARY KEY,
    "missionId"     TEXT     NOT NULL,
    "seq"           INTEGER  NOT NULL,
    "eventType"     TEXT     NOT NULL,
    "payload"       TEXT     NOT NULL DEFAULT '{}',
    "agentId"       TEXT,
    "correlationId" TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_key"
   ON "MissionBlackboard"("missionId", "seq")`,
  `CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_seq_idx"
   ON "MissionBlackboard"("missionId", "seq")`,
  `CREATE INDEX IF NOT EXISTS "MissionBlackboard_missionId_createdAt_idx"
   ON "MissionBlackboard"("missionId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "MissionBlackboard_correlationId_idx"
   ON "MissionBlackboard"("correlationId")`,
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
        return db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='MissionBlackboard'")
          .all();
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
        return [...db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='MissionBlackboard'").all()];
      },
      close() {
        db.close();
      },
    };
  }
}

const db = openAdapter();

function runCreate(createSql) {
  db.exec(createSql);
  for (const idx of INDEXES) {
    db.exec(idx);
  }
}

try {
  runCreate(SQL_CREATE_WITH_FK);
} catch (err) {
  const msg = err && err.message ? String(err.message) : String(err);
  if (
    msg.includes('FOREIGN KEY') ||
    msg.includes('foreign key') ||
    msg.includes('Mission') ||
    msg.includes('no such table')
  ) {
    console.warn('[create-mission-blackboard-table] FK create failed, retrying without CONSTRAINT:', msg.slice(0, 200));
    runCreate(SQL_CREATE_NO_FK);
  } else {
    throw err;
  }
}

const result = db.verify();
console.log('[create-mission-blackboard-table] table exists:', result.length > 0);
db.close();
