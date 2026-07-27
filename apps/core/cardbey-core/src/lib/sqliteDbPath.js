/**
 * Canonical SQLite path resolution for Cardbey Core.
 * Server resolves relative file: URLs from PACKAGE_ROOT (cardbey-core).
 * Prisma CLI resolves relative file: URLs from the schema directory (prisma/sqlite/).
 * Use DATABASE_URL=file:../dev.db in .env so both target prisma/dev.db.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** Lazy load so Vitest/Vite does not try to bundle node:sqlite. */
function openReadonlySqlite(absolutePath) {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(absolutePath, { readonly: true });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.join(__dirname, '..', '..');

export const CANONICAL_DEV_DB = path.join(PACKAGE_ROOT, 'prisma', 'dev.db');
export const CANONICAL_TEST_DB = path.join(PACKAGE_ROOT, 'prisma', 'test.db');
export const CANONICAL_PROD_DB = path.join(PACKAGE_ROOT, 'prisma', 'prod.db');

/** Relative DATABASE_URL values that map to canonical package-root DB files. */
export const CANONICAL_SQLITE_URLS = {
  dev: 'file:../dev.db',
  test: 'file:../test.db',
  prod: 'file:../prod.db',
};

/** Legacy .env values that resolve correctly at runtime but break Prisma CLI. */
const LEGACY_DEV_URLS = new Set([
  'file:./prisma/dev.db',
  'file:prisma/dev.db',
  './prisma/dev.db',
  'prisma/dev.db',
]);

const GHOST_PATH_MARKERS = [
  `${path.sep}prisma${path.sep}sqlite${path.sep}prisma${path.sep}`,
  `${path.sep}prisma${path.sep}prisma${path.sep}`,
];

export function isGhostSqlitePath(absolutePath) {
  if (!absolutePath) return false;
  const normalized = path.normalize(absolutePath);
  return GHOST_PATH_MARKERS.some((marker) => normalized.includes(marker));
}

export function isLegacyDevDatabaseUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().replace(/\?.*$/, '');
  return LEGACY_DEV_URLS.has(trimmed);
}

/**
 * Extract filesystem path from file: URL (Unix or Windows).
 * Relative paths resolve from PACKAGE_ROOT unless they are ../dev.db style aliases.
 */
export function getPathFromFileUrl(url) {
  if (!url || !url.toLowerCase().startsWith('file:')) return null;
  let p = url.replace(/\?.*$/, '').slice(5).trim();
  if (/^[A-Za-z]:\//i.test(p)) return path.normalize(p.replace(/\//g, path.sep));
  if (p.startsWith('/') && !p.startsWith('//')) return path.normalize(p);
  p = p.replace(/^\.\//, '').replace(/^\/+/, '');
  const posix = p.replace(/\\/g, '/');
  if (posix === '../dev.db') return CANONICAL_DEV_DB;
  if (posix === '../test.db') return CANONICAL_TEST_DB;
  if (posix === '../prod.db') return CANONICAL_PROD_DB;
  return p ? path.resolve(PACKAGE_ROOT, p.replace(/\//g, path.sep)) : null;
}

export function filePathFromSqliteUrl(url) {
  const stripped = url.replace(/\?.*$/, '');
  let p = stripped.slice('file:'.length).replace(/^\/+/, '').trim();
  if (path.isAbsolute(p)) return p;
  const posix = p.replace(/\\/g, '/').replace(/^\.\//, '');
  if (posix === '../dev.db') return CANONICAL_DEV_DB;
  if (posix === '../test.db') return CANONICAL_TEST_DB;
  if (posix === '../prod.db') return CANONICAL_PROD_DB;
  return path.resolve(PACKAGE_ROOT, p);
}

export function resolveSqliteDatabasePath(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.toLowerCase().startsWith('file:')) return null;
  return getPathFromFileUrl(databaseUrl) || filePathFromSqliteUrl(databaseUrl);
}

export function toFileUrl(absolutePath) {
  const normalized = path.normalize(absolutePath);
  const withForwardSlashes = normalized.split(path.sep).join('/');
  if (/^[A-Za-z]:\//.test(withForwardSlashes)) return `file:${withForwardSlashes}`;
  return withForwardSlashes.startsWith('/') ? `file:${withForwardSlashes}` : `file:/${withForwardSlashes}`;
}

/**
 * Inspect SQLite schema state (no Prisma required).
 * @param {string} absolutePath
 */
export function inspectSqliteDatabase(absolutePath) {
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return { exists: false, absolutePath };
  }
  const stat = fs.statSync(absolutePath);
  const out = {
    exists: true,
    absolutePath,
    sizeBytes: stat.size,
    mtime: stat.mtime.toISOString(),
  };
  try {
    const db = openReadonlySqlite(absolutePath);
    const cols = db
      .prepare('PRAGMA table_info("DraftStore")')
      .all()
      .map((r) => r.name);
    out.draftStoreColumns = cols;
    out.draftStoreHasPublishSnapshot = cols.includes('publishSnapshot');
    out.draftStoreHasPublishSnapshotVersion = cols.includes('publishSnapshotVersion');
    try {
      out.migrationCount = db.prepare('SELECT COUNT(*) AS c FROM _prisma_migrations').get()?.c ?? 0;
      out.latestMigration = db
        .prepare('SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1')
        .get()?.migration_name ?? null;
      out.latestMigrations = db
        .prepare('SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5')
        .all()
        .map((m) => m.migration_name);
    } catch {
      out.migrationCount = 0;
      out.latestMigration = null;
      out.latestMigrations = [];
    }
    db.close();
  } catch (e) {
    out.inspectError = e?.message || String(e);
  }
  return out;
}
