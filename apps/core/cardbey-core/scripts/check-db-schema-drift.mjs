#!/usr/bin/env node
/**
 * Predeploy / post-migrate schema drift gate (W6 DB integrity).
 * Fails in production-like environments when required columns are missing.
 *
 * Usage:
 *   npm run gate:db-schema-drift
 *   SKIP_DB_SCHEMA_DRIFT_GATE=1 npm run gate:db-schema-drift   # emergency bypass
 */
import {
  buildHealthDbFingerprint,
  checkRequiredColumnsLive,
} from '../src/lib/schemaFingerprint.js';
import { checkMigrationHealth } from '../src/lib/migrationHealthCheck.js';

await import('../src/env/ensureDatabaseUrl.js');

function isProdLike() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging' ||
    !!process.env.RENDER_SERVICE_ID ||
    !!process.env.RENDER_EXTERNAL_URL
  );
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function isBlockingFingerprintWarning(warning) {
  if (!warning || typeof warning !== 'string') return false;
  if (warning.startsWith('ghost_db_files:')) return true;
  return (
    warning === 'required_columns_missing' ||
    warning === 'migration_history_unsafe' ||
    warning === 'sqlite_in_production' ||
    warning === 'creative_asset_campaign_id_null_drift'
  );
}

async function main() {
  if (process.env.SKIP_DB_SCHEMA_DRIFT_GATE === '1') {
    console.warn('[gate:db-schema-drift] SKIP_DB_SCHEMA_DRIFT_GATE=1 — gate bypassed');
    return;
  }

  const prodLike = isProdLike();
  const live = await checkRequiredColumnsLive();
  const fp = buildHealthDbFingerprint();
  const migration = await checkMigrationHealth();

  console.log('[gate:db-schema-drift]', {
    prodLike,
    provider: live.provider,
    requiredColumnsOk: live.requiredColumnsOk,
    requiredColumnStatus: live.requiredColumnStatus,
    healthOk: fp.ok,
    warnings: fp.warnings,
    migrationOk: migration.ok,
    migrationPending: migration.pending,
    migrationFailed: migration.failed,
  });

  if (live.requiredColumnsOk === false) {
    const detail = JSON.stringify(live.requiredColumnStatus);
    const msg =
      `[gate:db-schema-drift] requiredColumnsOk:false — missing required columns: ${detail}\n` +
      '  Fix: npx prisma migrate deploy --schema prisma/postgres/schema.prisma (prod)\n' +
      '       npm run db:migrate:dev (sqlite dev)';
    if (prodLike) fail(msg);
    console.warn(`[gate:db-schema-drift] WARN (non-prod): ${msg}`);
  }

  if (!migration.ok) {
    const msg =
      `[gate:db-schema-drift] migration health not ok: pending=${migration.pending.join(',') || 'none'} failed=${migration.failed.join(',') || 'none'}`;
    if (prodLike) fail(msg);
    console.warn(`[gate:db-schema-drift] WARN (non-prod): ${msg}`);
  }

  const blockingWarnings = (fp.warnings || []).filter(isBlockingFingerprintWarning);
  if (prodLike && blockingWarnings.length > 0) {
    fail(
      `[gate:db-schema-drift] blocking fingerprint warnings: ${blockingWarnings.join(', ')}`,
    );
  }

  if (prodLike && !fp.ok && (fp.warnings?.length ?? 0) > 0) {
    console.warn(
      `[gate:db-schema-drift] non-blocking fingerprint warnings (deploy allowed): ${fp.warnings.join(', ')}`,
    );
  }

  console.log('[gate:db-schema-drift] OK');
}

main().catch((err) => {
  fail(`[gate:db-schema-drift] fatal: ${err?.message || err}`);
});
