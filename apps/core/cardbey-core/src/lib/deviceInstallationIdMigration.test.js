import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeInstallationId, hashInstallationId } from './deviceIdentity.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sqliteMigration = path.join(
  root,
  'prisma/sqlite/migrations/20260715120000_device_installation_id/migration.sql',
);
const postgresMigration = path.join(
  root,
  'prisma/postgres/migrations/20260715120000_device_installation_id/migration.sql',
);

describe('normalizeInstallationId', () => {
  it('accepts a stable string', () => {
    expect(normalizeInstallationId('68035bd2-c45c-4c11-9352-aaaaaaaaaaaa')).toBe(
      '68035bd2-c45c-4c11-9352-aaaaaaaaaaaa',
    );
  });

  it('returns NULL for blank / whitespace / sentinels', () => {
    expect(normalizeInstallationId(null)).toBeNull();
    expect(normalizeInstallationId(undefined)).toBeNull();
    expect(normalizeInstallationId('')).toBeNull();
    expect(normalizeInstallationId('   ')).toBeNull();
    expect(normalizeInstallationId('unknown')).toBeNull();
    expect(normalizeInstallationId('null')).toBeNull();
    expect(normalizeInstallationId('undefined')).toBeNull();
  });

  it('hashes only normalized values', () => {
    expect(hashInstallationId('')).toBeNull();
    expect(hashInstallationId('abc')).toHaveLength(16);
  });
});

describe('Phase 1 installationId migration SQL', () => {
  it('sqlite migration adds only Device.installationId + non-unique index', () => {
    const sql = fs.readFileSync(sqliteMigration, 'utf8');
    expect(sql).toMatch(/ALTER TABLE "Device" ADD COLUMN "installationId" TEXT/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "Device_installationId_idx"/);
    expect(sql).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(sql).not.toMatch(/ALTER TABLE "Creator"/i);
    expect(sql).not.toMatch(/ALTER TABLE "Product"/i);
    expect(sql).not.toMatch(/ALTER TABLE "StorePromo"/i);
    expect(sql).not.toMatch(/ALTER TABLE "LoyaltyProgram"/i);
    expect(sql).not.toMatch(/ALTER TABLE "DocumentTopologyRevision"/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });

  it('postgres migration mirrors Device-only Phase 1 change', () => {
    const sql = fs.readFileSync(postgresMigration, 'utf8');
    expect(sql).toMatch(
      /ALTER TABLE "Device"\s+ADD COLUMN IF NOT EXISTS "installationId" TEXT/,
    );
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "Device_installationId_idx"/);
    expect(sql).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(sql).not.toMatch(/ALTER TABLE "Creator"/i);
    expect(sql).not.toMatch(/ALTER TABLE "Product"/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});

describe('schema Phase 1: installationId is nullable non-unique', () => {
  function readDeviceBlock(schemaPath) {
    const text = fs.readFileSync(schemaPath, 'utf8');
    const m = text.match(/model Device \{[\s\S]*?\n\}/);
    expect(m).toBeTruthy();
    return m[0];
  }

  it('sqlite schema has installationId without @unique', () => {
    const block = readDeviceBlock(path.join(root, 'prisma/sqlite/schema.prisma'));
    expect(block).toMatch(/installationId\s+String\?/);
    expect(block).not.toMatch(/installationId\s+String\?\s+@unique/);
    expect(block).toMatch(/@@index\(\[installationId\]\)/);
  });

  it('postgres schema has installationId without @unique', () => {
    const block = readDeviceBlock(path.join(root, 'prisma/postgres/schema.prisma'));
    expect(block).toMatch(/installationId\s+String\?/);
    expect(block).not.toMatch(/installationId\s+String\?\s+@unique/);
    expect(block).toMatch(/@@index\(\[installationId\]\)/);
  });
});
