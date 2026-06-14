#!/usr/bin/env node
/**
 * Clear Postgres P3009 failed migration rows so migrate deploy can retry.
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

/** Runtime + deploy scripts use client-gen (see src/lib/prismaClient.js), not @prisma/client default. */
async function loadPrismaClient() {
  const clientGenUrl = new URL('../node_modules/.prisma/client-gen/index.js', import.meta.url);
  const mod = await import(clientGenUrl.href);
  return mod.PrismaClient;
}

async function listFailedMigrationNames() {
  const PrismaClient = await loadPrismaClient();
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name AS name
       FROM _prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
       ORDER BY started_at`,
    );
    return (Array.isArray(rows) ? rows : []).map((r) => String(r.name ?? r.migration_name ?? '')).filter(Boolean);
  } finally {
    await prisma.$disconnect();
  }
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

async function main() {
  // Client query needs generated client — best-effort generate if missing
  try {
    execSync(`npx prisma generate --schema=${schemaPath}`, {
      stdio: 'inherit',
      env: prismaEnv(),
      shell: true,
    });
  } catch (e) {
    console.warn('[resolve-postgres-failed] generate warning (continuing):', e?.message || e);
  }

  const failed = await listFailedMigrationNames();
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

main().catch((err) => {
  console.error('[resolve-postgres-failed] fatal:', err?.message || err);
  process.exit(1);
});
