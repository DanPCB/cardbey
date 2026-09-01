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

  if (!migration.ok && live.provider === 'sqlite') {
    const msg =
      `[gate:db-schema-drift] sqlite migration history dirty: pending=${migration.pending.join(',') || 'none'} failed=${migration.failed.join(',') || 'none'}`;
    if (prodLike) fail(msg);
    console.warn(`[gate:db-schema-drift] WARN (non-prod): ${msg}`);
  }

  if (prodLike && !fp.ok) {
    fail(
      `[gate:db-schema-drift] health fingerprint not ok: warnings=${fp.warnings.join(', ') || 'none'}`,
    );
  }

  console.log('[gate:db-schema-drift] OK');
}

main().catch((err) => {
  fail(`[gate:db-schema-drift] fatal: ${err?.message || err}`);
});
