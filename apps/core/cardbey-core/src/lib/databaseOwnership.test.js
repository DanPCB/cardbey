import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANONICAL_DEV_DB, PACKAGE_ROOT, isGhostSqlitePath } from './sqliteDbPath.js';

describe('canonical database paths', () => {
  it('canonical dev.db lives under apps/core/cardbey-core/prisma/dev.db', () => {
    expect(CANONICAL_DEV_DB).toBe(path.join(PACKAGE_ROOT, 'prisma', 'dev.db'));
    expect(PACKAGE_ROOT.endsWith(`${path.sep}cardbey-core`)).toBe(true);
  });

  it('flags ghost sqlite paths under prisma/sqlite/prisma and prisma/prisma', () => {
    expect(
      isGhostSqlitePath(path.join(PACKAGE_ROOT, 'prisma', 'sqlite', 'prisma', 'dev.db')),
    ).toBe(true);
    expect(isGhostSqlitePath(path.join(PACKAGE_ROOT, 'prisma', 'prisma', 'dev.db'))).toBe(true);
    expect(isGhostSqlitePath(CANONICAL_DEV_DB)).toBe(false);
  });

  it('audit script exists at scripts/audit-databases.mjs', () => {
    const audit = path.join(PACKAGE_ROOT, 'scripts', 'audit-databases.mjs');
    expect(fs.existsSync(audit)).toBe(true);
  });

  it('baseline audit reports migration drift when folders exceed applied rows', async () => {
    const { analyzeMigrationDrift, listMigrationFolderNames } = await import('./schemaFingerprint.js');
    const folders = listMigrationFolderNames();
    expect(folders.length).toBeGreaterThan(50);
    const drift = analyzeMigrationDrift(CANONICAL_DEV_DB);
    expect(drift.migrationFolderCount).toBe(folders.length);
    expect(Array.isArray(drift.missingApplied)).toBe(true);
  });
});
