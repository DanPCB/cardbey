import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDatabaseIdentityAtStartup,
  getDatabaseIdentityReport,
} from './dbIdentity.js';
import { inspectSqliteDatabase, toFileUrl } from './sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

function createMinimalDraftStoreDb(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE "DraftStore" (
      "id" TEXT PRIMARY KEY,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.close();
}

function addPublishSnapshotColumns(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    ALTER TABLE "DraftStore" ADD COLUMN "publishSnapshot" TEXT;
    ALTER TABLE "DraftStore" ADD COLUMN "publishSnapshotVersion" INTEGER NOT NULL DEFAULT 0;
  `);
  db.close();
}

describe('dbIdentity', () => {
  /** @type {Record<string, string | undefined>} */
  let envBackup;

  beforeEach(() => {
    envBackup = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
  });

  it('inspectSqliteDatabase detects missing publishSnapshotVersion', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-db-audit-'));
    const dbPath = path.join(dir, 'test.db');
    createMinimalDraftStoreDb(dbPath);
    const inspect = inspectSqliteDatabase(dbPath);
    expect(inspect.draftStoreHasPublishSnapshotVersion).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails fast when PUBLISH_SNAPSHOT_V1=true and column missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-db-fail-'));
    const dbPath = path.join(dir, 'missing-col.db');
    createMinimalDraftStoreDb(dbPath);
    process.env.DATABASE_URL = toFileUrl(dbPath);
    process.env.PUBLISH_SNAPSHOT_V1 = 'true';
    expect(() => assertDatabaseIdentityAtStartup()).toThrow(/publishSnapshotVersion/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes when PUBLISH_SNAPSHOT_V1=true and columns exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-db-ok-'));
    const dbPath = path.join(dir, 'ok.db');
    createMinimalDraftStoreDb(dbPath);
    addPublishSnapshotColumns(dbPath);
    process.env.DATABASE_URL = toFileUrl(dbPath);
    process.env.PUBLISH_SNAPSHOT_V1 = 'true';
    expect(() => assertDatabaseIdentityAtStartup()).not.toThrow();
    const report = getDatabaseIdentityReport();
    expect(report.draftStoreHasPublishSnapshotVersion).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('allows missing columns when PUBLISH_SNAPSHOT_V1 is off', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-db-off-'));
    const dbPath = path.join(dir, 'off.db');
    createMinimalDraftStoreDb(dbPath);
    process.env.DATABASE_URL = toFileUrl(dbPath);
    delete process.env.PUBLISH_SNAPSHOT_V1;
    expect(() => assertDatabaseIdentityAtStartup()).not.toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('dashboard DATABASE_URL policy', () => {
  it('dashboard package does not define DATABASE_URL in env examples', async () => {
    const { readFileSync, existsSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dashRoot = path.resolve(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'dashboard',
      'cardbey-marketing-dashboard',
    );
    const envFiles = ['.env', '.env.example', '.env.local', '.env.development'].map((f) =>
      join(dashRoot, f),
    );
    for (const fp of envFiles) {
      if (!existsSync(fp)) continue;
      const content = readFileSync(fp, 'utf8');
      expect(content, fp).not.toMatch(/^\s*DATABASE_URL\s*=/m);
    }
  });
});

describe('with-role dev cwd', () => {
  it('with-role.mjs runs commands from cardbey-core package root', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const script = readFileSync(
      join(import.meta.dirname, '..', '..', 'scripts', 'with-role.mjs'),
      'utf8',
    );
    expect(script).toContain("path.dirname(fileURLToPath(import.meta.url)), '..'");
    expect(script).toMatch(/cwd:\s*root/);
  });
});

describe('PrismaClient singleton policy', () => {
  it('runtime prisma helper is the only production import path', async () => {
    const { readFileSync } = await import('node:fs');
    const prismaJs = readFileSync(
      path.join(import.meta.dirname, 'prisma.js'),
      'utf8',
    );
    expect(prismaJs).toContain('export function getPrismaClient()');
    expect(prismaJs).toContain("from './prismaClient.js'");
  });
});
