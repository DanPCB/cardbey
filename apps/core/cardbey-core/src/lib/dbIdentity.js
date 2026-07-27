/**
 * Database identity checks at Core startup.
 * Ensures runtime SQLite file matches Prisma Client expectations for enabled features.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_SQLITE_URLS,
  PACKAGE_ROOT,
  isGhostSqlitePath,
  isLegacyDevDatabaseUrl,
  inspectSqliteDatabase,
  resolveSqliteDatabasePath,
} from './sqliteDbPath.js';

function isPublishSnapshotEnabled() {
  const v = process.env.PUBLISH_SNAPSHOT_V1;
  return v === 'true' || v === '1';
}

function schemaProviderFromUrl(url) {
  const lowered = (url || '').toLowerCase();
  if (lowered.startsWith('postgresql://') || lowered.startsWith('postgres://')) return 'postgres';
  if (lowered.startsWith('prisma://') || lowered.startsWith('prisma+postgres://')) return 'postgres_proxy';
  if (lowered.startsWith('file:')) return 'sqlite';
  return 'unknown';
}

/**
 * Build DB identity report (safe to log; no credentials).
 */
export function getDatabaseIdentityReport() {
  const databaseUrl = process.env.DATABASE_URL ?? null;
  const provider = schemaProviderFromUrl(databaseUrl || '');
  const resolvedDbPath = provider === 'sqlite' ? resolveSqliteDatabasePath(databaseUrl) : null;
  const inspect =
    provider === 'sqlite' && resolvedDbPath ? inspectSqliteDatabase(resolvedDbPath) : null;

  let prismaClientVersion = null;
  let prismaClientGenPath = path.join(PACKAGE_ROOT, 'node_modules', '.prisma', 'client-gen');
  try {
    const pkgPath = path.join(prismaClientGenPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      prismaClientVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null;
    }
  } catch {
    /* ignore */
  }

  return {
    cwd: process.cwd(),
    packageRoot: PACKAGE_ROOT,
    nodeEnv: process.env.NODE_ENV ?? null,
    databaseUrl,
    resolvedDbPath,
    exists: resolvedDbPath ? fs.existsSync(resolvedDbPath) : null,
    schemaProvider: provider,
    migrationCount: inspect?.migrationCount ?? null,
    latestMigration: inspect?.latestMigration ?? null,
    draftStoreHasPublishSnapshot: inspect?.draftStoreHasPublishSnapshot ?? null,
    draftStoreHasPublishSnapshotVersion: inspect?.draftStoreHasPublishSnapshotVersion ?? null,
    isGhostPath: resolvedDbPath ? isGhostSqlitePath(resolvedDbPath) : false,
    legacyDatabaseUrl: isLegacyDevDatabaseUrl(databaseUrl),
    canonicalDevUrl: CANONICAL_SQLITE_URLS.dev,
    prismaClientVersion,
    prismaClientGenPath,
    prismaClientGenExists: fs.existsSync(prismaClientGenPath),
    publishSnapshotV1Enabled: isPublishSnapshotEnabled(),
  };
}

/**
 * Log [DB_IDENTITY] and fail fast when schema is incompatible with enabled flags.
 */
export function assertDatabaseIdentityAtStartup() {
  const report = getDatabaseIdentityReport();
  console.log('[DB_IDENTITY]', JSON.stringify(report, null, 0));

  if (report.schemaProvider === 'sqlite' && report.resolvedDbPath) {
    if (report.isGhostPath) {
      throw new Error(
        `[DB_IDENTITY] DATABASE_URL resolves to a non-canonical ghost SQLite file: ${report.resolvedDbPath}. ` +
          `Use ${CANONICAL_SQLITE_URLS.dev} in apps/core/cardbey-core/.env and run npm run db:migrate:dev from that package.`,
      );
    }
    if (report.legacyDatabaseUrl && process.env.NODE_ENV !== 'test') {
      console.warn(
        `[DB_IDENTITY] DATABASE_URL uses a legacy path (file:./prisma/dev.db). Prisma CLI/Studio resolve it to a different file than Core. ` +
          `Set DATABASE_URL=${CANONICAL_SQLITE_URLS.dev} in apps/core/cardbey-core/.env`,
      );
    }
  }

  if (isPublishSnapshotEnabled() && report.schemaProvider === 'sqlite') {
    if (!report.exists) {
      throw new Error(
        `[DB_IDENTITY] PUBLISH_SNAPSHOT_V1=true but SQLite database file does not exist: ${report.resolvedDbPath}. ` +
          `Run: cd apps/core/cardbey-core && npm run db:migrate:dev`,
      );
    }
    if (!report.draftStoreHasPublishSnapshotVersion) {
      throw new Error(
        `[DB_IDENTITY] Database schema does not match Prisma Client (missing DraftStore.publishSnapshotVersion). ` +
          `Run migration against: ${report.resolvedDbPath}\n` +
          `  cd apps/core/cardbey-core && npm run db:migrate:dev`,
      );
    }
  }
}

/**
 * Log [CORE_ENV] boot context (no secrets).
 */
export function logCoreEnvBoot() {
  const port = process.env.PORT || '3001';
  const apiBase =
    process.env.API_BASE ||
    process.env.PUBLIC_API_BASE_URL ||
    `http://127.0.0.1:${port}`;
  console.log(
    '[CORE_ENV]',
    JSON.stringify({
      cwd: process.cwd(),
      port,
      databaseUrl: process.env.DATABASE_URL ?? null,
      apiBase,
      nodeEnv: process.env.NODE_ENV ?? null,
      role: process.env.ROLE ?? null,
    }),
  );
}
