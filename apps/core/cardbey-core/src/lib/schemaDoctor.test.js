import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ENGAGEMENT_MIGRATION,
  formatSchemaDoctorReport,
  REQUIRED_TABLES,
  runSchemaDoctor,
} from './schemaDoctor.js';
import { toFileUrl } from './sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

function createMinimalDb(dbPath, { withEngagement = false, withPromoType = true } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE "_prisma_migrations" (
    id TEXT PRIMARY KEY,
    migration_name TEXT,
    finished_at TEXT
  )`);
  db.exec(`CREATE TABLE "Business" ("id" TEXT PRIMARY KEY)`);
  const promoCols = withPromoType
    ? '"promoType" TEXT, "updatedAt" TEXT'
    : '"updatedAt" TEXT';
  db.exec(`CREATE TABLE "StorePromo" ("id" TEXT PRIMARY KEY, ${promoCols})`);

  if (withEngagement) {
    for (const table of REQUIRED_TABLES) {
      db.exec(`CREATE TABLE "${table}" ("id" TEXT PRIMARY KEY)`);
    }
    db.prepare(
      'INSERT INTO _prisma_migrations (id, migration_name, finished_at) VALUES (?, ?, ?)',
    ).run('1', ENGAGEMENT_MIGRATION, new Date().toISOString());
  }
  db.close();
}

describe('schemaDoctor', () => {
  let envBackup;
  let tmpDir;

  beforeEach(() => {
    envBackup = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-doc-'));
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects missing engagement tables and migration', async () => {
    const dbPath = path.join(tmpDir, 'stale.db');
    createMinimalDb(dbPath, { withEngagement: false });
    process.env.DATABASE_URL = toFileUrl(dbPath);

    const report = await runSchemaDoctor();
    expect(report.ok).toBe(false);
    expect(report.missingTables).toEqual(expect.arrayContaining(['StoreActivityEvent']));
    expect(report.missingMigrations.length).toBeGreaterThan(0);
    expect(report.requiredMigration).toBe(ENGAGEMENT_MIGRATION);

    const text = formatSchemaDoctorReport(report);
    expect(text).toContain('Database incompatible');
    expect(text).toContain('StoreActivityEvent');
    expect(text).toContain('repair-schema');
  });

  it('passes when engagement tables and migration are present', async () => {
    const dbPath = path.join(tmpDir, 'ok.db');
    createMinimalDb(dbPath, { withEngagement: true, withPromoType: true });
    process.env.DATABASE_URL = toFileUrl(dbPath);

    const report = await runSchemaDoctor();
    expect(report.tablesOk).toBe(true);
    expect(report.missingTables).toHaveLength(0);
    expect(report.missingColumns).toHaveLength(0);
  });

  it('detects missing StorePromo.promoType', async () => {
    const dbPath = path.join(tmpDir, 'no-promo-type.db');
    createMinimalDb(dbPath, { withEngagement: true, withPromoType: false });
    process.env.DATABASE_URL = toFileUrl(dbPath);

    const report = await runSchemaDoctor();
    expect(report.columnsOk).toBe(false);
    expect(report.missingColumns).toContainEqual({ table: 'StorePromo', column: 'promoType' });
  });
});
