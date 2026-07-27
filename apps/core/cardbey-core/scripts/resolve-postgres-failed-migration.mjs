#!/usr/bin/env node
/**
 * Clear Postgres P3009 failed migration rows so migrate deploy can retry.
 *
 * Uses Prisma CLI for resolve; queries _prisma_migrations via PrismaClient when status omits failures.
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
const defaultAllowlist = [
  '20260613120000_add_ghost_store_models',
  '20260619140000_add_executive_growth_models',
  '20260619150000_add_business_lead_models',
  // Idempotent Payment column/index DDL (IF NOT EXISTS) — safe to roll back and redeploy.
  '20260707140000_extend_payment_stripe_journey',
];
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

/** Parse only explicit failed-migration signals — never every migration name in status output. */
function parseFailedMigrationNames(text) {
  const names = new Set();
  const blob = String(text || '');

  for (const m of blob.matchAll(/The `([^`]+)` migration/g)) {
    names.add(m[1].trim());
  }

  for (const m of blob.matchAll(/Migration name:\s*(\S+)/g)) {
    names.add(m[1].trim());
  }

  const failedSection = blob.match(
    /following migrations? have failed:?\s*([\s\S]*?)(?:\n\n|\nTo |\nDatasource|\nEnvironment|$)/i,
  );
  if (failedSection) {
    for (const line of failedSection[1].split('\n')) {
      const hit = line.trim().match(/^(\d{14}_[\w]+)/);
      if (hit) names.add(hit[1]);
    }
  }

  return [...names];
}

function listFailedMigrationNames() {
  const status = runPrismaCli('migrate status');
  return parseFailedMigrationNames(status.combined);
}

/** migrate status often omits failed rows; query _prisma_migrations directly. */
async function listFailedMigrationNamesFromDb() {
  try {
    const clientGenUrl = new URL('../node_modules/.prisma/client-gen/index.js', import.meta.url);
    const { PrismaClient } = await import(clientGenUrl.href);
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const rows = await prisma.$queryRaw`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NULL
          AND rolled_back_at IS NULL
          AND started_at IS NOT NULL
      `;
      return rows.map((row) => String(row.migration_name || '').trim()).filter(Boolean);
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    console.warn('[resolve-postgres-failed] db query failed:', err?.message || err);
    return [];
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
  execSync(`npx prisma generate --schema=${schemaPath}`, {
    stdio: 'inherit',
    env: prismaEnv(),
    shell: true,
  });

  const explicitName = nameArg ? nameArg.split('=')[1].trim() : '';
  const fromStatus = listFailedMigrationNames();
  const fromDb = await listFailedMigrationNamesFromDb();
  const failed = [
    ...new Set([...fromStatus, ...fromDb, ...(explicitName ? [explicitName] : [])]),
  ].filter(Boolean);

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
    // Let prisma-bootstrap surface P3009 with full migrate deploy output.
    console.warn('[resolve-postgres-failed] no allowlisted targets resolved — continuing to bootstrap');
    return;
  }

  for (const name of targets) {
    resolveRolledBack(name);
  }

  console.log('[resolve-postgres-failed] done — migrate deploy can retry:', targets.join(', '));
}

try {
  await main();
} catch (err) {
  console.error('[resolve-postgres-failed] fatal:', err?.message || err);
  process.exit(1);
}
