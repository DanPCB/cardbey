#!/usr/bin/env node
/**
 * Baseline legacy prisma/migrations history when the DB was created via db push.
 *
 * Marks every migration whose SQL is already reflected in the DB (including Prisma
 * SQLite table-redefine migrations), then runs migrate deploy for the rest.
 *
 * Usage (stop Core / other DB holders first):
 *   node scripts/resolve-legacy-baseline.mjs --dry-run
 *   node scripts/resolve-legacy-baseline.mjs --apply --deploy
 */
import '../src/env/ensureDatabaseUrl.js';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyBaselineRepairPasses,
  listBaselineRepairCandidates,
  listFailedMigrationNames,
  parseMigrationNameFromPrismaError,
  repairAndMarkMigration,
} from '../src/lib/migrationBaselineRepair.js';
import { analyzeMigrationDrift } from '../src/lib/schemaFingerprint.js';
import { resolveSqliteDatabasePath } from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaArg = process.argv.find((a) => a.startsWith('--schema='));
const schemaPath = schemaArg
  ? path.resolve(root, schemaArg.split('=')[1])
  : path.join(root, 'prisma', 'schema.prisma');
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
const runDeploy = process.argv.includes('--deploy');

const dbPath = resolveSqliteDatabasePath();
if (!dbPath) {
  console.error('[resolve-legacy-baseline] DATABASE_URL must be a SQLite file: URL');
  process.exit(1);
}
if (!fs.existsSync(schemaPath)) {
  console.error('[resolve-legacy-baseline] schema not found:', schemaPath);
  process.exit(1);
}

const migrationsDir = path.join(path.dirname(schemaPath), 'migrations');
if (!fs.existsSync(migrationsDir)) {
  console.error('[resolve-legacy-baseline] migrations dir not found:', migrationsDir);
  process.exit(1);
}

function tableExists(name) {
  const db = new DatabaseSync(dbPath, { readonly: true });
  try {
    return !!db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name);
  } finally {
    db.close();
  }
}

if (!tableExists('User')) {
  console.error('[resolve-legacy-baseline] User table missing — not a db-push baseline.');
  process.exit(1);
}

const drift = analyzeMigrationDrift(dbPath, migrationsDir);
const failed = listFailedMigrationNames(dbPath);
const candidates = listBaselineRepairCandidates(dbPath, migrationsDir);

console.log('[resolve-legacy-baseline]', {
  dbPath,
  schemaPath,
  migrationsDir,
  pending: drift.missingApplied.length,
  failed: failed.length,
  repairable: candidates.length,
  mode: dryRun ? 'dry-run' : apply ? 'apply' : 'preview',
});

if (failed.length) {
  console.log('[resolve-legacy-baseline] failed rows:', failed.join(', '));
}
for (const c of candidates) {
  console.log(`  + ${c.name} (${c.reason})`);
}

if (!apply && !dryRun) {
  console.log('\nRe-run with --dry-run or --apply [--deploy]');
  process.exit(0);
}

if (dryRun) {
  process.exit(candidates.length > 0 || failed.length > 0 ? 0 : 1);
}

const marked = applyBaselineRepairPasses(dbPath, migrationsDir);
console.log('[resolve-legacy-baseline] marked applied:', marked);

const schemaFlag = schemaPath.replace(/\\/g, '/');
if (!runDeploy) {
  console.log(
    '[resolve-legacy-baseline] done — run:',
    `npx prisma migrate deploy --schema=${schemaFlag}`,
  );
  process.exit(0);
}

function runDeployOnce() {
  const deployCmd = `npx prisma migrate deploy --schema=${schemaFlag}`;
  console.log('[resolve-legacy-baseline]', deployCmd);
  const r = spawnSync(deployCmd, {
    encoding: 'utf8',
    env: process.env,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  const combined = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return { status: r.status ?? 1, combined };
}

const maxDeployAttempts = 5;
for (let attempt = 1; attempt <= maxDeployAttempts; attempt++) {
  const result = runDeployOnce();
  if (result.status === 0) {
    console.log('[resolve-legacy-baseline] migrate deploy succeeded');
    process.exit(0);
  }

  if (!result.combined.includes('P3009') && !result.combined.includes('P3018')) {
    process.exit(result.status);
  }

  console.warn(`[resolve-legacy-baseline] deploy attempt ${attempt} blocked — repairing`);

  const extraMarked = applyBaselineRepairPasses(dbPath, migrationsDir);
  if (extraMarked > 0) {
    console.log('[resolve-legacy-baseline] marked applied (retry pass):', extraMarked);
    continue;
  }

  const blockedMigration =
    parseMigrationNameFromPrismaError(result.combined) ?? listFailedMigrationNames(dbPath)[0];
  if (blockedMigration) {
    console.warn(
      `[resolve-legacy-baseline] best-effort apply for blocked migration: ${blockedMigration}`,
    );
    try {
      const repair = repairAndMarkMigration(dbPath, migrationsDir, blockedMigration);
      console.log('[resolve-legacy-baseline] best-effort repair:', repair);
      continue;
    } catch (repairErr) {
      console.error(
        '[resolve-legacy-baseline] best-effort repair failed:',
        repairErr?.message || repairErr,
      );
    }
  }

  const stillFailed = listFailedMigrationNames(dbPath);
  if (stillFailed.length === 0) break;

  for (const name of stillFailed) {
    const cmd = `npx prisma migrate resolve --rolled-back ${name} --schema=${schemaFlag}`;
    console.log('[resolve-legacy-baseline]', cmd);
    execSync(cmd, { stdio: 'inherit', env: process.env, shell: true });
  }
}

console.error('[resolve-legacy-baseline] migrate deploy still failing after repair passes.');
console.error('  Check: npx prisma migrate status --schema=' + schemaFlag);
process.exit(1);
