/**
 * Single source of truth for DATABASE_URL resolution.
 * Must be imported first (before any PrismaClient is constructed).
 * - Development: local SQLite fallback allowed (prisma/prod.db or .env).
 * - Production (Render or NODE_ENV=production): requires explicit DATABASE_URL or
 *   PERSISTENT_DISK_PATH; never falls back to /tmp; fail-fast if resolved path is ephemeral.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'url';
import {
  CANONICAL_DEV_DB,
  CANONICAL_SQLITE_URLS,
  filePathFromSqliteUrl,
  getPathFromFileUrl,
  isGhostSqlitePath,
  isLegacyDevDatabaseUrl,
  toFileUrl,
} from '../lib/sqliteDbPath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(__dirname, '..', '..');
const envPath = path.join(PACKAGE_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

/** Paths wiped on Render/container restart — must not be used in production. */
const EPHEMERAL_PREFIXES = ['/tmp', '/var/run'];
const PERSISTENT_DISK_PATH_ENV = 'PERSISTENT_DISK_PATH';
const DEFAULT_SQLITE_FILENAME = 'cardbey-prod.db';

function isRender() {
  return !!(process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);
}

function isProduction() {
  return isRender() || process.env.NODE_ENV === 'production';
}

function isEphemeralPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const normalized = path.normalize(filePath).replace(/\\/g, '/');
  return EPHEMERAL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Reduce SQLITE_BUSY failures when draft generation and reasoning-log writes overlap. */
function appendSqliteBusyTimeout(url) {
  if (!url || typeof url !== 'string' || !url.toLowerCase().startsWith('file:')) return url;
  if (/[?&]busy_timeout=/i.test(url)) return url;
  const ms = Number.parseInt(String(process.env.SQLITE_BUSY_TIMEOUT_MS ?? '30000'), 10);
  const busyTimeout = Number.isFinite(ms) && ms > 0 ? ms : 30_000;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}busy_timeout=${busyTimeout}`;
}

function stripSqliteUrlQuery(url) {
  return typeof url === 'string' ? url.replace(/\?.*$/, '') : url;
}

function ensureSqliteWritable() {
  const url = stripSqliteUrlQuery(process.env.DATABASE_URL);
  if (!url?.toLowerCase().startsWith('file:')) return;

  const fp = getPathFromFileUrl(url) || filePathFromSqliteUrl(url);

  if (!isProduction() && isGhostSqlitePath(fp)) {
    throw new Error(
      `[env] DATABASE_URL points at a ghost SQLite path (not canonical): ${fp}. ` +
        `Set DATABASE_URL=${CANONICAL_SQLITE_URLS.dev} in apps/core/cardbey-core/.env`,
    );
  }

  // Already on persistent disk — confirm and return without re-resolving
  const _diskPath = process.env[PERSISTENT_DISK_PATH_ENV];
  if (_diskPath && path.isAbsolute(fp) && fp.startsWith(path.resolve(_diskPath.trim()))) {
    process.env.DATABASE_URL = toFileUrl(fp);
    console.log('[env] DATABASE_URL(final)=', process.env.DATABASE_URL);
    return;
  }

  if (isProduction() && isEphemeralPath(fp)) {
    throw new Error(
      `[env] Production database must not use ephemeral path: ${fp}. ` +
        `Set DATABASE_URL to a persistent path (e.g. on a mounted disk) or set ${PERSISTENT_DISK_PATH_ENV}.`
    );
  }

  if (isRender() && fp && !path.isAbsolute(fp)) {
    const diskPath = process.env[PERSISTENT_DISK_PATH_ENV];
    if (!diskPath || !diskPath.trim()) {
      throw new Error(
        `[env] On Render with SQLite, set DATABASE_URL to file:<absolute-path> or set ${PERSISTENT_DISK_PATH_ENV} (e.g. /data). ` +
          `Ephemeral /tmp is not allowed.`
      );
    }
    const persistentPath = path.join(diskPath.trim(), DEFAULT_SQLITE_FILENAME);
    process.env.DATABASE_URL = toFileUrl(persistentPath);
    console.log('[env] DATABASE_URL(final)=', process.env.DATABASE_URL);
    return;
  }

  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const fd = fs.openSync(fp, 'a');
    fs.closeSync(fd);
    process.env.DATABASE_URL = toFileUrl(fp);
    if (!isProduction()) console.log('[env] DATABASE_URL(final)=', process.env.DATABASE_URL);
  } catch (e) {
    if (isProduction()) {
      throw new Error(
        `[env] SQLite path not writable: ${fp}. ${e?.message || e}. ` +
          `Use a persistent mount (e.g. set ${PERSISTENT_DISK_PATH_ENV}=/data and mount disk at /data).`
      );
    }
    const fallback = CANONICAL_DEV_DB;
    console.warn('[env] sqlite path not writable, falling back to', fallback, e?.message);
    process.env.DATABASE_URL = toFileUrl(fallback);
  }
}

function normalizeDatabaseUrl() {
  let url = process.env.DATABASE_URL;

  if (!url || typeof url !== 'string' || !url.trim()) {
    if (isProduction()) {
      const diskPath = process.env[PERSISTENT_DISK_PATH_ENV];
      if (diskPath && diskPath.trim()) {
        const persistentPath = path.join(diskPath.trim(), DEFAULT_SQLITE_FILENAME);
        process.env.DATABASE_URL = toFileUrl(persistentPath);
        console.log('[env] DATABASE_URL set from', PERSISTENT_DISK_PATH_ENV, '→', process.env.DATABASE_URL);
        return;
      }
      throw new Error(
        `[env] Production requires DATABASE_URL or ${PERSISTENT_DISK_PATH_ENV}. ` +
          `Do not rely on ephemeral storage (/tmp is wiped on restart).`
      );
    }
    const defaultPath = path.join(PACKAGE_ROOT, 'prisma', 'prod.db');
    process.env.DATABASE_URL = toFileUrl(defaultPath);
    console.warn('[env] DATABASE_URL missing; defaulting to', process.env.DATABASE_URL);
    return;
  }

  url = url.trim();

  if (isLegacyDevDatabaseUrl(url) && !isProduction()) {
    console.warn(
      `[env] Legacy DATABASE_URL (${url}) — Prisma CLI/Studio may use a different file than Core. ` +
        `Prefer ${CANONICAL_SQLITE_URLS.dev} in apps/core/cardbey-core/.env`,
    );
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
  if (hasScheme) {
    if (url.toLowerCase().startsWith('postgres')) {
      return;
    }
    if (url.toLowerCase().startsWith('file:')) {
      const pathPart =
        getPathFromFileUrl(url) ||
        filePathFromSqliteUrl(url) ||
        url.slice(5).replace(/^\.\//, '').trim();
      if (isProduction() && isEphemeralPath(pathPart)) {
        throw new Error(
          `[env] Production database must not use ephemeral path: ${pathPart}. ` +
            `Use a persistent path or set ${PERSISTENT_DISK_PATH_ENV}.`
        );
      }
      if (isRender() && pathPart && !path.isAbsolute(pathPart.replace(/\//g, path.sep))) {
        const diskPath = process.env[PERSISTENT_DISK_PATH_ENV];
        if (!diskPath || !diskPath.trim()) {
          throw new Error(
            `[env] On Render with relative SQLite path, set ${PERSISTENT_DISK_PATH_ENV} (e.g. /data).`
          );
        }
        process.env.DATABASE_URL = toFileUrl(path.join(diskPath.trim(), DEFAULT_SQLITE_FILENAME));
        console.warn('[env] Render: SQLite path set from', PERSISTENT_DISK_PATH_ENV, '→', process.env.DATABASE_URL);
      }
      return;
    }
    return;
  }

  if (isRender() && !url.startsWith('/') && !path.isAbsolute(url)) {
    const diskPath = process.env[PERSISTENT_DISK_PATH_ENV];
    if (!diskPath || !diskPath.trim()) {
      throw new Error(`[env] On Render set DATABASE_URL (file:...) or ${PERSISTENT_DISK_PATH_ENV}.`);
    }
    process.env.DATABASE_URL = toFileUrl(path.join(diskPath.trim(), DEFAULT_SQLITE_FILENAME));
    console.warn('[env] Render: SQLite path set from', PERSISTENT_DISK_PATH_ENV);
    return;
  }

  const relativePath = url.replace(/^\.\//, '');
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(PACKAGE_ROOT, relativePath);
  if (isProduction() && isEphemeralPath(absolutePath)) {
    throw new Error(`[env] Production database must not use ephemeral path: ${absolutePath}.`);
  }
  process.env.DATABASE_URL = toFileUrl(absolutePath);
  if (!isProduction()) console.warn('[env] normalized DATABASE_URL to', process.env.DATABASE_URL);
}

function logStartupAndFailIfEphemeral() {
  const url = process.env.DATABASE_URL || '';
  const lowered = url.toLowerCase().trim();
  const schemeMatch = lowered.match(/^([a-z0-9+.-]+):\/\//);
  const scheme = schemeMatch?.[1] || (lowered.startsWith('file:') ? 'file' : lowered.split(':')[0] || 'unknown');
  const isPostgres =
    lowered.startsWith('postgresql://') ||
    lowered.startsWith('postgres://') ||
    lowered.startsWith('prisma://') ||
    lowered.startsWith('prisma+postgres://');
  const filePath = isPostgres ? null : getPathFromFileUrl(stripSqliteUrlQuery(url)) || stripSqliteUrlQuery(url).slice(5).trim();
  const ephemeral = filePath ? isEphemeralPath(filePath) : false;
  const environment = isRender() ? 'render' : process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const provider = isPostgres ? (scheme.startsWith('prisma') ? 'postgres_proxy' : 'postgres') : 'sqlite';
  const displayUrl = isPostgres
    ? scheme.startsWith('prisma')
      ? 'prisma+postgres://*** (redacted)'
      : 'postgresql://*** (redacted)'
    : (filePath || url || '(not set)');
  const storage = isPostgres ? 'persistent' : ephemeral ? 'ephemeral' : 'persistent';
  const instanceId = typeof os.hostname === 'function' ? os.hostname() : `pid-${process.pid}`;
  const engineType = String(process.env.PRISMA_CLIENT_ENGINE_TYPE || '').trim() || null;

  // If Prisma client is configured for Data Proxy, DATABASE_URL must be a prisma:// or prisma+postgres:// URL.
  // This is a common staging misconfiguration when Render env provides a direct postgres URL.
  const expectsProxy =
    engineType != null &&
    (engineType.toLowerCase() === 'dataproxy' ||
      engineType.toLowerCase() === 'data-proxy' ||
      engineType.toLowerCase() === 'edge');
  const hasProxyUrl = lowered.startsWith('prisma://') || lowered.startsWith('prisma+postgres://');
  if (expectsProxy && !hasProxyUrl) {
    throw new Error(
      `[env] Prisma is configured for Data Proxy (PRISMA_CLIENT_ENGINE_TYPE=${engineType}) ` +
        `but DATABASE_URL is '${scheme}://…'. ` +
        `Fix staging env: either unset PRISMA_CLIENT_ENGINE_TYPE (use default binary engine) ` +
        `or set DATABASE_URL to a prisma:// or prisma+postgres:// URL and provide DIRECT_URL/POSTGRES_DATABASE_URL for direct access if needed.`,
    );
  }

  console.log('[env] DB resolution:', {
    environment,
    provider,
    scheme,
    prismaEngine: engineType,
    resolved: displayUrl,
    storage,
    instanceId,
  });

  if (isProduction() && ephemeral) {
    throw new Error(
      `[env] Production must not use ephemeral DB path: ${filePath}. ` +
        `Set DATABASE_URL to a persistent path or set ${PERSISTENT_DISK_PATH_ENV} and mount a persistent disk.`
    );
  }

  if (isProduction() && !isPostgres) {
    console.warn(
      '[env] SQLite in production: with multiple instances, each instance uses its own DB file. ' +
        'Use Postgres (DATABASE_URL=postgresql://...) or run a single instance to avoid DRAFT_NOT_FOUND.'
    );
  }
}

normalizeDatabaseUrl();
ensureSqliteWritable();
if (process.env.DATABASE_URL?.toLowerCase().startsWith('file:')) {
  process.env.DATABASE_URL = appendSqliteBusyTimeout(process.env.DATABASE_URL);
}
logStartupAndFailIfEphemeral();
