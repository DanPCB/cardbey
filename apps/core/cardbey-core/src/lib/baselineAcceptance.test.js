import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BASELINE_ACCEPTANCE_PATH,
  buildHealthDbFingerprint,
  buildSchemaFingerprint,
  classifyMigrationHealth,
  loadBaselineAcceptance,
  loadCommittedFingerprint,
  readSchemaPrismaHash,
  validateBaselineAcceptance,
  verifyOptionABaseline,
} from './schemaFingerprint.js';
import { CANONICAL_DEV_DB } from './sqliteDbPath.js';

describe('baseline acceptance migration health', () => {
  let envBackup;
  let acceptanceBackup = null;

  beforeEach(() => {
    envBackup = { ...process.env };
    process.env.NODE_ENV = 'development';
    delete process.env.RENDER_SERVICE_ID;
    delete process.env.RENDER_EXTERNAL_URL;
    if (fs.existsSync(BASELINE_ACCEPTANCE_PATH)) {
      acceptanceBackup = fs.readFileSync(BASELINE_ACCEPTANCE_PATH, 'utf8');
    }
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) delete process.env[key];
    }
    Object.assign(process.env, envBackup);
    if (acceptanceBackup != null) {
      fs.writeFileSync(BASELINE_ACCEPTANCE_PATH, acceptanceBackup);
    } else if (fs.existsSync(BASELINE_ACCEPTANCE_PATH)) {
      fs.unlinkSync(BASELINE_ACCEPTANCE_PATH);
    }
    acceptanceBackup = null;
  });

  function driftFp(overrides = {}) {
    return {
      migrationDrift: {
        missingApplied: ['m1'],
        unappliedInDb: [],
        migrationFolderCount: 118,
      },
      migrationCount: 111,
      requiredColumnsOk: true,
      schemaHashMatch: true,
      tableHashMatch: true,
      ghostDbFiles: [],
      provider: 'sqlite',
      resolvedDbPath: CANONICAL_DEV_DB,
      schemaPrismaHash: readSchemaPrismaHash(),
      tableColumnHash: '9b3dca5ba6126be0',
      ...overrides,
    };
  }

  it('drift without acceptance file is unsafe', () => {
    if (fs.existsSync(BASELINE_ACCEPTANCE_PATH)) fs.unlinkSync(BASELINE_ACCEPTANCE_PATH);
    const fp = driftFp();
    expect(classifyMigrationHealth(fp)).toBe('unsafe');
    expect(loadBaselineAcceptance()).toBeNull();
  });

  it('drift with matching acceptance is accepted in local dev', () => {
    if (!fs.existsSync(CANONICAL_DEV_DB)) return;
    const fp = buildSchemaFingerprint();
    if (!verifyOptionABaseline(fp)) return;
    const committed = loadCommittedFingerprint();
    if (!committed) return;

    fs.writeFileSync(
      BASELINE_ACCEPTANCE_PATH,
      JSON.stringify({
        databaseLabel: 'prisma/dev.db',
        schemaPrismaHash: fp.schemaPrismaHash,
        tableColumnHash: fp.tableColumnHash,
        acceptedMigrationCount: fp.migrationCount,
        migrationFolderCount: fp.migrationDrift?.migrationFolderCount,
        acceptedAt: new Date().toISOString(),
        reason: 'Option A conservative baseline verified',
      }),
    );

    expect(validateBaselineAcceptance(fp)).toBe(true);
    expect(classifyMigrationHealth(fp)).toBe('accepted');

    process.env.DATABASE_URL = 'file:../dev.db';
    const health = buildHealthDbFingerprint();
    expect(health.migrationHealth).toBe('accepted');
    expect(health.ok).toBe(true);
    expect(health.warnings).not.toContain('migration_history_unsafe');
  });

  it('stale hash acceptance is unsafe', () => {
    if (!fs.existsSync(CANONICAL_DEV_DB)) return;
    const fp = buildSchemaFingerprint();
    if (!fp.schemaPrismaHash) return;

    fs.writeFileSync(
      BASELINE_ACCEPTANCE_PATH,
      JSON.stringify({
        schemaPrismaHash: fp.schemaPrismaHash,
        tableColumnHash: 'stale_hash_value',
      }),
    );
    expect(validateBaselineAcceptance(fp)).toBe(false);
    expect(classifyMigrationHealth(fp)).toBe('unsafe');
  });

  it('production ignores local acceptance file', () => {
    const fp = driftFp({ provider: 'postgres', resolvedDbPath: null });
    process.env.NODE_ENV = 'production';
    fs.writeFileSync(
      BASELINE_ACCEPTANCE_PATH,
      JSON.stringify({
        schemaPrismaHash: fp.schemaPrismaHash,
        tableColumnHash: fp.tableColumnHash,
      }),
    );
    expect(loadBaselineAcceptance()).toBeNull();
    expect(classifyMigrationHealth(fp)).toBe('unsafe');
  });

  it('fully aligned migrations return ok', () => {
    const fp = driftFp({
      migrationDrift: {
        missingApplied: [],
        unappliedInDb: [],
        migrationFolderCount: 118,
      },
    });
    expect(classifyMigrationHealth(fp)).toBe('ok');
  });
});
