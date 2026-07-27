#!/usr/bin/env node
/**
 * Verify canonical SQLite DB has expected migrations/columns.
 * Exit 1 on failure. Run: npm run db:verify
 */
import '../src/env/ensureDatabaseUrl.js';
import {
  CANONICAL_DEV_DB,
  inspectSqliteDatabase,
  resolveSqliteDatabasePath,
} from '../src/lib/sqliteDbPath.js';

const resolved = resolveSqliteDatabasePath();
if (!resolved) {
  console.error('[db:verify] DATABASE_URL is not SQLite file: URL');
  process.exit(1);
}

const inspect = inspectSqliteDatabase(resolved);
const errors = [];

if (!inspect.exists) {
  errors.push(`Database file does not exist: ${resolved}`);
}

if (resolved !== CANONICAL_DEV_DB && process.env.NODE_ENV !== 'test') {
  console.warn(`[db:verify] Warning: resolved path is not canonical dev.db:\n  resolved: ${resolved}\n  canonical: ${CANONICAL_DEV_DB}`);
}

const requireSnapshot =
  process.env.PUBLISH_SNAPSHOT_V1 === 'true' || process.env.PUBLISH_SNAPSHOT_V1 === '1';

if (requireSnapshot && !inspect.draftStoreHasPublishSnapshotVersion) {
  errors.push('Missing DraftStore.publishSnapshotVersion (required when PUBLISH_SNAPSHOT_V1=true)');
}

if (errors.length) {
  console.error('[db:verify] FAILED');
  for (const e of errors) console.error(' -', e);
  console.error(`\nFix: cd apps/core/cardbey-core && npm run db:migrate:dev`);
  process.exit(1);
}

console.log('[db:verify] OK', {
  resolvedDbPath: resolved,
  migrationCount: inspect.migrationCount,
  latestMigration: inspect.latestMigration,
  publishSnapshotVersion: inspect.draftStoreHasPublishSnapshotVersion,
});
