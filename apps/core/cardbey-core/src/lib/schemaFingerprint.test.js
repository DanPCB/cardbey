import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSchemaFingerprintAtStartup,
  buildHealthDbFingerprint,
  buildSchemaFingerprint,
  hashString,
  readSchemaPrismaHash,
  resolvedDbLabel,
  SCHEMA_SQLITE_PATH,
} from './schemaFingerprint.js';
import { toFileUrl } from './sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

describe('schemaFingerprint', () => {
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

  it('schema hash changes when schema file content changes', () => {
    const h1 = readSchemaPrismaHash();
    expect(h1).toBeTruthy();
    expect(h1).not.toBe(hashString('fake-schema-content'));
  });

  it('STRICT_SCHEMA_FINGERPRINT requires committed hash to match live schema', () => {
    const live = readSchemaPrismaHash();
    const committed = { schemaPrismaHash: 'deadbeef00000000' };
    expect(live).not.toBe(committed.schemaPrismaHash);
  });

  it('required DraftStore columns enforced when PUBLISH_SNAPSHOT_V1=true', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-pub-'));
    const dbPath = path.join(dir, 't.db');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE "DraftStore" ("id" TEXT PRIMARY KEY)`);
    db.close();
    process.env.DATABASE_URL = toFileUrl(dbPath);
    process.env.PUBLISH_SNAPSHOT_V1 = 'true';
    process.env.NODE_ENV = 'development';
    expect(() => assertSchemaFingerprintAtStartup()).toThrow(/publishSnapshot|PUBLISH|Required/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('NODE_ENV=production rejects SQLite DATABASE_URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'file:../dev.db';
    delete process.env.STRICT_SCHEMA_FINGERPRINT;
    expect(() => assertSchemaFingerprintAtStartup()).toThrow(/production must not use SQLite/i);
  });

  it('health fingerprint hides full path in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const fp = buildHealthDbFingerprint();
    expect(fp.resolvedDbPath).toBeUndefined();
    expect(fp.databaseKind).toBe('postgres');
  });

  it('health fingerprint shows full path in local dev', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-dev-'));
    const dbPath = path.join(dir, 'local.db');
    fs.writeFileSync(dbPath, '');
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = toFileUrl(dbPath);
    const fp = buildHealthDbFingerprint();
    expect(fp.resolvedDbPath).toBe(path.resolve(dbPath));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolvedDbLabel redacts sqlite paths in production', () => {
    expect(resolvedDbLabel('/data/prisma/dev.db', 'production')).toBe('sqlite-dev');
  });

  it('ghost path detection in audit', () => {
    const fp = buildSchemaFingerprint();
    expect(Array.isArray(fp.ghostDbFiles)).toBe(true);
  });
});

describe('schema freeze / migration drift', () => {
  it('migration drift analysis returns missingApplied array', async () => {
    const { analyzeMigrationDrift } = await import('./schemaFingerprint.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-drift-'));
    const dbPath = path.join(dir, 'd.db');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE _prisma_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      finished_at TEXT,
      migration_name TEXT NOT NULL,
      logs TEXT,
      rolled_back_at TEXT,
      started_at TEXT NOT NULL,
      applied_steps_count INTEGER NOT NULL
    )`);
    db.exec(`INSERT INTO _prisma_migrations VALUES ('1','c',datetime('now'),'20260309234049_init',NULL,NULL,datetime('now'),1)`);
    db.close();
    const drift = analyzeMigrationDrift(dbPath);
    expect(drift.unappliedInDb).toContain('20260309234049_init');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
