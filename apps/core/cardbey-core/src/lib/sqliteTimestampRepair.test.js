import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  findTablesWithTimestamp3,
  repairAllTimestamp3Columns,
  tableHasTimestamp3Columns,
} from './sqliteTimestampRepair.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

describe('sqliteTimestampRepair', () => {
  let dbPath;
  /** @type {import('node:sqlite').DatabaseSync | null} */
  let db = null;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `cardbey-ts-repair-${Date.now()}.db`);
    db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE "DraftStore" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "mode" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "input" TEXT NOT NULL,
        "transferredAt" TIMESTAMP(3)
      );
    `);
  });

  afterEach(() => {
    db?.close();
    db = null;
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch {
        /* absent */
      }
    }
  });

  it('detects TIMESTAMP(3) on DraftStore.transferredAt', () => {
    expect(tableHasTimestamp3Columns(db, 'DraftStore')).toBe(true);
    expect(findTablesWithTimestamp3(db)).toEqual(['DraftStore']);
  });

  it('repairs TIMESTAMP(3) column to DATETIME', () => {
    db.exec(`INSERT INTO "DraftStore" ("id", "updatedAt", "expiresAt", "mode", "input")
      VALUES ('d1', datetime('now'), datetime('now', '+7 days'), 'template', '{}')`);

    const repaired = repairAllTimestamp3Columns(db);
    expect(repaired).toEqual(['DraftStore']);
    expect(tableHasTimestamp3Columns(db, 'DraftStore')).toBe(false);

    const cols = db.prepare('PRAGMA table_info("DraftStore")').all();
    const transferredAt = cols.find((c) => c.name === 'transferredAt');
    expect(transferredAt?.type).toBe('DATETIME');

    const row = db.prepare('SELECT id FROM "DraftStore" WHERE id = ?').get('d1');
    expect(row?.id).toBe('d1');
  });
});
