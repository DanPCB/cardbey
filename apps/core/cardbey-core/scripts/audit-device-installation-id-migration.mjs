#!/usr/bin/env node
/**
 * Read-only audit for Device V2 Phase 1 installationId migration (SQLite).
 *
 * Usage:
 *   node scripts/audit-device-installation-id-migration.mjs
 *   node scripts/audit-device-installation-id-migration.mjs --db=path/to.db
 *
 * Exit codes:
 *   0 — column + non-unique index present; no empty-string IDs; no unique index
 *   2 — column missing (migration not applied yet) — informational unsafe for runtime column writes
 *   3 — empty-string IDs or unique index present (must fix before Phase 3 uniqueness)
 *   1 — unexpected error / Device table missing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import {
  resolveSqliteDatabasePath,
  CANONICAL_DEV_DB,
  toFileUrl,
} from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), override: true });

const dbArg = process.argv.find((a) => a.startsWith('--db='));
let dbPath = dbArg?.split('=').slice(1).join('=');
if (dbPath) {
  dbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
} else {
  if (!process.env.DATABASE_URL?.startsWith('file:')) {
    process.env.DATABASE_URL = 'file:../dev.db';
  }
  dbPath =
    resolveSqliteDatabasePath(process.env.DATABASE_URL.replace(/\?.*$/, '')) ||
    CANONICAL_DEV_DB;
}

console.log('[device-install-audit] database:', dbPath);
console.log('[device-install-audit] url hint:', toFileUrl(dbPath));

if (!fs.existsSync(dbPath)) {
  console.error('[device-install-audit] FAIL: database file does not exist');
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readonly: true });

function tableExists(name) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return Boolean(row);
}

try {
  if (!tableExists('Device')) {
    console.error('[device-install-audit] FAIL: Device table missing');
    process.exit(1);
  }

  const columns = db.prepare(`PRAGMA table_info('Device')`).all();
  const colNames = columns.map((c) => c.name);
  const hasInstallationId = colNames.includes('installationId');

  const indexes = db.prepare(`PRAGMA index_list('Device')`).all();
  const indexDetails = indexes.map((idx) => {
    const cols = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
    return {
      name: idx.name,
      unique: Boolean(idx.unique),
      columns: cols.map((c) => c.name),
    };
  });

  const nonUniqueInstallIdx = indexDetails.find(
    (i) =>
      !i.unique &&
      i.columns.length === 1 &&
      i.columns[0] === 'installationId',
  );
  const uniqueInstallIdx = indexDetails.find(
    (i) =>
      i.unique &&
      i.columns.length === 1 &&
      i.columns[0] === 'installationId',
  );

  console.log('[device-install-audit] Device columns:', colNames.join(', '));
  console.log('[device-install-audit] installationId column:', hasInstallationId ? 'PRESENT' : 'MISSING');
  console.log(
    '[device-install-audit] Device_installationId_idx (non-unique):',
    nonUniqueInstallIdx ? `PRESENT (${nonUniqueInstallIdx.name})` : 'MISSING',
  );
  console.log(
    '[device-install-audit] unique installationId index:',
    uniqueInstallIdx ? `PRESENT (${uniqueInstallIdx.name}) — unexpected in Phase 1` : 'absent (expected Phase 1)',
  );

  let exitCode = 0;

  if (!hasInstallationId) {
    console.warn(
      '[device-install-audit] WARN: installationId not applied yet. Apply prisma/sqlite/migrations/20260715120000_device_installation_id via migrate deploy (not db push).',
    );
    exitCode = Math.max(exitCode, 2);
  } else {
    const duplicates = db
      .prepare(
        `
      SELECT
        installationId,
        COUNT(*) AS recordCount,
        GROUP_CONCAT(id) AS deviceIds
      FROM Device
      WHERE installationId IS NOT NULL
        AND TRIM(installationId) <> ''
      GROUP BY installationId
      HAVING COUNT(*) > 1
    `,
      )
      .all();

    const emptyStrings = db
      .prepare(
        `
      SELECT id
      FROM Device
      WHERE installationId IS NOT NULL
        AND TRIM(installationId) = ''
    `,
      )
      .all();

    const nullCount = db
      .prepare(`SELECT COUNT(*) AS c FROM Device WHERE installationId IS NULL`)
      .get().c;
    const nonNullCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM Device WHERE installationId IS NOT NULL AND TRIM(installationId) <> ''`,
      )
      .get().c;

    console.log('[device-install-audit] null installationId count:', nullCount);
    console.log('[device-install-audit] non-null installationId count:', nonNullCount);
    console.log('[device-install-audit] duplicate non-null groups:', duplicates.length);
    if (duplicates.length) {
      for (const d of duplicates) {
        console.log('  duplicate:', {
          installationId: d.installationId,
          recordCount: d.recordCount,
          deviceIds: d.deviceIds,
        });
      }
      console.warn(
        '[device-install-audit] WARN: duplicates exist — allowed in Phase 1; resolve before Phase 3 uniqueness.',
      );
    }
    console.log('[device-install-audit] empty-string installationId rows:', emptyStrings.length);
    if (emptyStrings.length) {
      console.error(
        '[device-install-audit] FAIL: empty-string installation IDs must be normalized to NULL',
        emptyStrings.map((r) => r.id),
      );
      exitCode = Math.max(exitCode, 3);
    }
    if (!nonUniqueInstallIdx) {
      console.warn(
        '[device-install-audit] WARN: non-unique Device_installationId_idx missing (migration incomplete).',
      );
      exitCode = Math.max(exitCode, 2);
    }
  }

  if (uniqueInstallIdx) {
    console.error(
      '[device-install-audit] FAIL: unique installationId index exists — Phase 1 must not introduce uniqueness yet.',
    );
    exitCode = Math.max(exitCode, 3);
  }

  if (exitCode === 0) {
    console.log('[device-install-audit] OK — Phase 1 schema shape looks safe');
  }
  process.exit(exitCode);
} catch (err) {
  console.error('[device-install-audit] ERROR:', err?.message || err);
  process.exit(1);
} finally {
  try {
    db.close();
  } catch {
    /* ignore */
  }
}
