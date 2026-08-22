/**
 * Disposable SQLite DB for Live Market integration tests.
 *
 * Modes:
 * - `createDisposableSchemaSqlite()` — empty file + `db push` current schema (integration tests).
 * - `proveSqliteMigrateFromZero()` — attempts full `migrate deploy` (documents pre-existing chain breaks).
 * - `proveLiveMarketMigrationSql()` — schema push, drop LiveMarket*, re-apply our migration SQL.
 *
 * Never touches prisma/test.db, dev.db, staging, or production.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { toFileUrl } from '../../sqliteDbPath.js';

const require = createRequire(import.meta.url);
const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const HOLDING_DIR = path.join(coreRoot, 'prisma', '.live-market-it');
const { PrismaClient } = require(path.join(coreRoot, 'node_modules', '.prisma', 'client-gen'));
const prismaCli = path.join(coreRoot, 'node_modules', 'prisma', 'build', 'index.js');
const LIVE_MARKET_MIGRATION_SQL = path.join(
  coreRoot,
  'prisma',
  'sqlite',
  'migrations',
  '20260813120000_live_market_phase1_foundation',
  'migration.sql',
);

function toPrismaCliRelativeUrl(dbPath) {
  const fileName = path.basename(dbPath);
  return `file:../.live-market-it/${fileName}`;
}

function runPrisma(args, databaseUrlForCli) {
  try {
    return execFileSync(process.execPath, [prismaCli, ...args], {
      cwd: coreRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrlForCli,
        NODE_ENV: 'test',
        PRISMA_CLIENT_ENGINE_TYPE: process.env.PRISMA_CLIENT_ENGINE_TYPE || 'binary',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    const detail = [err?.stdout?.toString?.(), err?.stderr?.toString?.(), err?.message]
      .filter(Boolean)
      .join('\n');
    const wrapped = new Error(`prisma ${args.join(' ')} failed:\n${detail}`);
    wrapped.cause = err;
    throw wrapped;
  }
}

function allocDbPath(label) {
  fs.mkdirSync(HOLDING_DIR, { recursive: true });
  const stamp = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
  const safe = String(label || 'it').replace(/[^a-z0-9_-]/gi, '');
  const dbPath = path.join(HOLDING_DIR, `live-market-${safe}-${stamp}.db`);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  return dbPath;
}

function wrapClient(dbPath) {
  const databaseUrlForCli = toPrismaCliRelativeUrl(dbPath);
  const databaseUrlForClient = toFileUrl(dbPath);
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrlForClient } },
    log: ['error'],
  });
  return {
    prisma,
    dbPath,
    databaseUrl: databaseUrlForClient,
    databaseUrlForCli,
    async cleanup() {
      try {
        await prisma.$disconnect();
      } catch {
        /* ignore */
      }
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        try {
          fs.unlinkSync(dbPath + suffix);
        } catch {
          /* ignore */
        }
      }
    },
  };
}

/**
 * Preferred harness for integration tests: current schema via db push on a disposable file.
 * (Full migrate-from-zero is blocked by a pre-existing migration chain failure — see docs.)
 */
export function createDisposableSchemaSqlite(opts = {}) {
  const dbPath = allocDbPath(opts.label || 'schema');
  const databaseUrlForCli = toPrismaCliRelativeUrl(dbPath);
  runPrisma(
    ['db', 'push', '--schema', 'prisma/sqlite/schema.prisma', '--accept-data-loss', '--skip-generate'],
    databaseUrlForCli,
  );
  return wrapClient(dbPath);
}

/**
 * Attempt full migrate deploy on empty disposable DB.
 * @returns {Promise<{ ok: boolean, error?: string, migrationCount?: number, failedAt?: string, tables?: string[] }>}
 */
export async function proveSqliteMigrateFromZero() {
  const dbPath = allocDbPath('from-zero');
  const disposable = wrapClient(dbPath);
  try {
    runPrisma(['migrate', 'deploy', '--schema', 'prisma/sqlite/schema.prisma'], disposable.databaseUrlForCli);
    const rows = await disposable.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as c FROM "_prisma_migrations"`,
    );
    const migrationCount = Number(rows?.[0]?.c ?? 0);
    const tables = await disposable.prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'LiveMarket%' ORDER BY name`,
    );
    return {
      ok: true,
      dbPath,
      migrationCount,
      tables: (tables || []).map((t) => t.name),
    };
  } catch (err) {
    const msg = err?.message || String(err);
    const failedAt = /Migration name:\s*(\S+)/.exec(msg)?.[1] || null;
    return {
      ok: false,
      error: msg,
      failedAt,
      diagnosis:
        failedAt === '20260711080337_init'
          ? 'Pre-existing migration chain break: 20260711080337_init references AccountProfile before that table exists. Shared DBs use db push (no _prisma_migrations), which is why migrate deploy hits P3005 on test.db/dev.db.'
          : 'Migrate-from-zero failed; see error for details.',
    };
  } finally {
    await disposable.cleanup();
  }
}

/**
 * Verify Live Market migration SQL against a schema-compatible disposable base:
 * db push → drop LiveMarket* → apply migration.sql → assert tables.
 */
export async function proveLiveMarketMigrationSql() {
  const disposable = createDisposableSchemaSqlite({ label: 'sql-proof' });
  try {
    await disposable.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "LiveMarketSessionSubject"`);
    await disposable.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "LiveMarketSession"`);
    await disposable.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "LiveMarketPilotEnrollment"`);

    const sql = fs.readFileSync(LIVE_MARKET_MIGRATION_SQL, 'utf8');
    // SQLite exec of multi-statement file
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(disposable.dbPath);
    try {
      db.exec(sql);
    } finally {
      db.close();
    }

    const tables = await disposable.prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'LiveMarket%' ORDER BY name`,
    );
    const names = (tables || []).map((t) => t.name);
    const expected = [
      'LiveMarketPilotEnrollment',
      'LiveMarketSession',
      'LiveMarketSessionSubject',
    ];
    const missing = expected.filter((n) => !names.includes(n));
    if (missing.length) {
      return { ok: false, error: `missing tables after SQL apply: ${missing.join(', ')}`, tables: names };
    }
    return { ok: true, tables: names, method: 'db_push_then_reapply_live_market_sql' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    await disposable.cleanup();
  }
}
