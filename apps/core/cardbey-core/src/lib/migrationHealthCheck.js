/**
 * Dev-only: detect dirty Prisma migration history before per-request schema errors pile up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveSqliteDatabasePath } from './sqliteDbPath.js';

const require = createRequire(import.meta.url);
const coreRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function isSqliteDatabaseUrl(url = process.env.DATABASE_URL) {
  const u = String(url || '');
  return u.startsWith('file:') || u.includes('.db');
}

/**
 * @returns {Promise<{ ok: boolean, failed: string[], pending: string[], message?: string }>}
 */
export async function checkMigrationHealth() {
  if (!isSqliteDatabaseUrl()) {
    return { ok: true, failed: [], pending: [] };
  }

  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    return { ok: true, failed: [], pending: [] };
  }

  let db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return { ok: true, failed: [], pending: [] };
  }

  try {
    const table = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'")
      .get();
    if (!table) {
      return {
        ok: false,
        failed: [],
        pending: [],
        message: '_prisma_migrations table missing — database was never migrated',
      };
    }

    const failed = db
      .prepare(
        `SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NULL AND rolled_back_at IS NULL AND logs IS NOT NULL`,
      )
      .all()
      .map((r) => r.migration_name);

    const diskMigrations = new Set();
    try {
      // SQLite dev DB uses prisma/sqlite/migrations only (not legacy prisma/migrations).
      const migrationsDir = path.join(coreRoot, 'prisma', 'sqlite', 'migrations');
      if (fs.existsSync(migrationsDir)) {
        for (const name of fs.readdirSync(migrationsDir)) {
          if (fs.statSync(path.join(migrationsDir, name)).isDirectory()) {
            diskMigrations.add(name);
          }
        }
      }
    } catch {
      /* ignore disk scan errors */
    }

    const applied = new Set(
      db
        .prepare('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')
        .all()
        .map((r) => r.migration_name),
    );

    const pending = [...diskMigrations].filter((name) => !applied.has(name)).sort();

    const ok = failed.length === 0 && pending.length === 0;
    return { ok, failed, pending };
  } finally {
    db?.close?.();
  }
}

/** Log a loud banner when migration history is dirty (dev/test only). */
export async function warnIfMigrationHistoryDirty() {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.SKIP_MIGRATION_HEALTH_CHECK === '1') return;

  try {
    const health = await checkMigrationHealth();
    if (health.ok) return;

    const lines = [
      '',
      '╔══════════════════════════════════════════════════════════════════╗',
      '║  ⚠️  DATABASE MIGRATION HISTORY IS DIRTY — FIX BEFORE DEBUGGING  ║',
      '╚══════════════════════════════════════════════════════════════════╝',
    ];
    if (health.failed.length) {
      lines.push(`Failed migrations: ${health.failed.join(', ')}`);
      lines.push(
        '  → npx prisma migrate resolve --applied <name> --schema=prisma/sqlite/schema.prisma',
      );
      lines.push('    (only after confirming SQL is already applied, or finish partial SQL first)');
    }
    if (health.pending.length) {
      lines.push(`Pending migrations: ${health.pending.join(', ')}`);
      lines.push('  → npx prisma migrate deploy --schema=prisma/sqlite/schema.prisma');
    }
    if (health.message) lines.push(health.message);
    lines.push(`DATABASE_URL → ${process.env.DATABASE_URL || '(unset)'}`);
    lines.push('');
    console.error(lines.join('\n'));
  } catch (err) {
    console.warn('[migration-health] check failed (non-fatal):', err?.message || err);
  }
}
