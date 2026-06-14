#!/usr/bin/env node
/**
 * Clear Postgres P3009 failed migration rows so migrate deploy can retry.
 *
 * Uses Prisma CLI only (no PrismaClient import) so pre-deploy never loads
 * @prisma/client or a stale SQLite client-gen by mistake.
 *
 * Usage:
 *   node scripts/resolve-postgres-failed-migration.mjs
 *   node scripts/resolve-postgres-failed-migration.mjs --name=20260613120000_add_ghost_store_models
 *   PRISMA_AUTO_RESOLVE_ROLLED_BACK=migration_a,migration_b node scripts/resolve-postgres-failed-migration.mjs
 */
import '../src/env/ensureDatabaseUrl.js';
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPostgresDatabaseUrl,
  pickDatabaseUrlForPrisma,
  resolvePrismaSchemaPath,
} from './prismaSchemaPath.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolvePrismaSchemaPath(root);
const dbUrl = pickDatabaseUrlForPrisma();

if (!isPostgresDatabaseUrl(dbUrl)) {
  console.log('[resolve-postgres-failed] not postgres — skipping');
  process.exit(0);
}

const nameArg = process.argv.find((a) => a.startsWith('--name='));
const envList = String(process.env.PRISMA_AUTO_RESOLVE_ROLLED_BACK ?? '').trim();
const defaultAllowlist = ['20260613120000_add_ghost_store_models'];
const allowlist = nameArg
  ? [nameArg.split('=')[1]]
  : envList
    ? envList.split(',').map((s) => s.trim()).filter(Boolean)
    : defaultAllowlist;

function prismaEnv() {
  return { ...process.env, DATABASE_URL: dbUrl, CI: process.env.CI || 'true' };
}

function runPrismaCli(subcommand) {
  const cmd = `npx prisma ${subcommand} --schema=${schemaPath}`;
  console.log('[resolve-postgres-failed]', cmd);
  const r = spawnSync(cmd, {
    encoding: 'utf8',
    env: prismaEnv(),
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  const combined = `${r.stderr || ''}${r.stdout || ''}`;
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return { status: r.status ?? 1, combined };
}

/** Parse migration names from migrate status / deploy P3009 output. */
function parseFailedMigrationNames(text) {
  const names = new Set();
  const blob = String(text || '');
  for (const m of blob.matchAll(/The `([^`]+)` migration/g)) {
    names.add(m[1].trim());
  }
  for (const m of blob.matchAll(/^\s*(\d{14}_[\w]+)\s*$/gm)) {
    const line = m[1].trim();
    if (blob.toLowerCase().includes('failed') && line.includes('_')) {
      names.add(line);
    }
  }
  return [...names];
}

function listFailedMigrationNames() {
  const status = runPrismaCli('migrate status');
  let failed = parseFailedMigrationNames(status.combined);
  if (failed.length > 0) return failed;

  const mentionsFailed =
    status.combined.includes('P3009') ||
    /failed migrations?/i.test(status.combined) ||
    /migration.*failed/i.test(status.combined);

  if (!mentionsFailed) return [];

  const deploy = runPrismaCli('migrate deploy');
  failed = parseFailedMigrationNames(deploy.combined);
  if (failed.length > 0) return failed;

  if (deploy.status === 0) {
    console.log('[resolve-postgres-failed] migrate deploy succeeded — no failed migrations to resolve');
    return [];
  }

  if (deploy.combined.includes('P3009')) {
    throw new Error(
      `[resolve-postgres-failed] P3009 but could not parse migration name:\n${deploy.combined.slice(0, 2000)}`,
    );
  }

  throw new Error(
    `[resolve-postgres-failed] migrate deploy failed (non-P3009):\n${deploy.combined.slice(0, 2000)}`,
  );
}

function resolveRolledBack(migrationName) {
  const cmd = `npx prisma migrate resolve --rolled-back ${migrationName} --schema=${schemaPath}`;
  console.log('[resolve-postgres-failed]', cmd);
  const r = spawnSync(cmd, {
    encoding: 'utf8',
    env: prismaEnv(),
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `resolve failed for ${migrationName}`);
  }
}

function main() {
  execSync(`npx prisma generate --schema=${schemaPath}`, {
    stdio: 'inherit',
    env: prismaEnv(),
    shell: true,
  });

  const failed = listFailedMigrationNames();
  if (failed.length === 0) {
    console.log('[resolve-postgres-failed] no failed migrations');
    return;
  }

  console.log('[resolve-postgres-failed] failed:', failed.join(', '));
  const targets = failed.filter((name) => allowlist.includes(name));
  const skipped = failed.filter((name) => !allowlist.includes(name));

  if (skipped.length > 0) {
    console.warn(
      '[resolve-postgres-failed] not auto-resolving (not in allowlist):',
      skipped.join(', '),
    );
    console.warn(
      '[resolve-postgres-failed] set PRISMA_AUTO_RESOLVE_ROLLED_BACK or run migrate resolve manually in Render Shell',
    );
  }

  if (targets.length === 0) {
    if (skipped.length > 0) process.exit(1);
    return;
  }

  for (const name of targets) {
    resolveRolledBack(name);
  }

  console.log('[resolve-postgres-failed] done — migrate deploy can retry:', targets.join(', '));
}

try {
  main();
} catch (err) {
  console.error('[resolve-postgres-failed] fatal:', err?.message || err);
  process.exit(1);
}
