#!/usr/bin/env node
/**
 * Report-only Device installationId duplicate reconciliation.
 * Does not merge. Does not auto-archive.
 *
 * Usage:
 *   node scripts/report-device-installation-duplicates.mjs
 *   node scripts/report-device-installation-duplicates.mjs --json > report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import {
  resolveSqliteDatabasePath,
  CANONICAL_DEV_DB,
} from '../src/lib/sqliteDbPath.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), override: true });

const asJson = process.argv.includes('--json');
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

if (!fs.existsSync(dbPath)) {
  console.error('[dup-report] database missing:', dbPath);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readonly: true });

function parseCaps(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function scoreDevice(row, nowMs) {
  const lastSeen = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
  const onlineBoost = row.status === 'online' ? 100_000 : 0;
  const freshBoost = lastSeen && nowMs - lastSeen < 180_000 ? 1_000_000 : 0;
  return freshBoost + onlineBoost + lastSeen;
}

try {
  const cols = db.prepare(`PRAGMA table_info('Device')`).all().map((c) => c.name);
  if (!cols.includes('installationId')) {
    console.error(
      '[dup-report] installationId column missing — apply Phase 1 migration first (report still can scan capabilities via JSON if needed, but column required for SQL grouping).',
    );
    process.exit(2);
  }

  const groups = db
    .prepare(
      `
    SELECT installationId, COUNT(*) AS recordCount
    FROM Device
    WHERE installationId IS NOT NULL AND TRIM(installationId) <> ''
    GROUP BY installationId
    HAVING COUNT(*) > 1
  `,
    )
    .all();

  const nowMs = Date.now();
  const reports = [];

  for (const g of groups) {
    const members = db
      .prepare(
        `
      SELECT d.id, d.tenantId, d.storeId, d.status, d.lastSeenAt, d.name, d.model, d.platform,
             d.pairingCode, d.installationId,
             (SELECT status FROM DevicePlaylistBinding b
               WHERE b.deviceId = d.id
               ORDER BY b.lastPushedAt DESC LIMIT 1) AS bindingStatus,
             (SELECT playlistId FROM DevicePlaylistBinding b
               WHERE b.deviceId = d.id
               ORDER BY b.lastPushedAt DESC LIMIT 1) AS playlistId,
             (SELECT capabilities FROM DeviceCapability c WHERE c.deviceId = d.id LIMIT 1) AS capabilities
      FROM Device d
      WHERE d.installationId = ?
    `,
      )
      .all(g.installationId);

    const enriched = members.map((m) => {
      const caps = parseCaps(m.capabilities);
      return {
        ...m,
        pairingStatus: caps.pairingStatus || null,
        archived: Boolean(caps.archivedAt),
        _score: scoreDevice(m, nowMs),
      };
    });

    enriched.sort((a, b) => b._score - a._score);
    const canonical = enriched[0];
    const duplicates = enriched.slice(1);

    const tenants = new Set(enriched.map((m) => m.tenantId).filter(Boolean));
    const realTenants = [...tenants].filter((t) => t !== 'temp');
    const mergeBlockers = [];

    let classification = 'safe_to_merge';
    if (realTenants.length > 1) {
      classification = 'cross_account_conflict';
      mergeBlockers.push('multiple_real_accounts');
    } else if (enriched.every((m) => m.archived)) {
      classification = 'insufficient_evidence';
      mergeBlockers.push('all_archived');
    } else if (
      realTenants.length <= 1 &&
      duplicates.some((d) => !d.archived && d.status === 'online' && d._score > 500_000)
    ) {
      classification = 'requires_owner_review';
      mergeBlockers.push('multiple_recently_active');
    } else if (realTenants.length === 0 && tenants.has('temp')) {
      classification = 'requires_owner_review';
      mergeBlockers.push('only_temp_ownership');
    }

    // Never recommend auto-merge across accounts.
    const safeMergeEligible =
      classification === 'safe_to_merge' &&
      realTenants.length <= 1 &&
      duplicates.every((d) => d.archived || d.status === 'offline');

    if (!safeMergeEligible && classification === 'safe_to_merge') {
      classification = 'requires_owner_review';
    }

    reports.push({
      installationId: g.installationId,
      classification,
      mergeConfidence: safeMergeEligible ? 'high' : classification === 'cross_account_conflict' ? 'blocked' : 'low',
      mergeBlockers,
      canonicalCandidate: {
        deviceId: canonical.id,
        tenantId: canonical.tenantId,
        storeId: canonical.storeId,
        status: canonical.status,
        lastSeenAt: canonical.lastSeenAt,
        playlistId: canonical.playlistId || null,
        pairingStatus: canonical.pairingStatus,
        archived: canonical.archived,
      },
      duplicates: duplicates.map((d) => ({
        deviceId: d.id,
        tenantId: d.tenantId,
        storeId: d.storeId,
        status: d.status,
        lastSeenAt: d.lastSeenAt,
        playlistId: d.playlistId || null,
        pairingStatus: d.pairingStatus,
        archived: d.archived,
      })),
      note: 'Report-only. Cross-account groups must never auto-merge.',
    });
  }

  const payload = {
    database: dbPath,
    generatedAt: new Date().toISOString(),
    duplicateGroupCount: reports.length,
    groups: reports,
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('[dup-report] database:', dbPath);
    console.log('[dup-report] duplicate groups:', reports.length);
    for (const r of reports) {
      console.log('---');
      console.log('installationId:', r.installationId);
      console.log('classification:', r.classification);
      console.log('canonical:', r.canonicalCandidate.deviceId, 'tenant=', r.canonicalCandidate.tenantId);
      console.log(
        'duplicates:',
        r.duplicates.map((d) => d.deviceId).join(', ') || '(none)',
      );
      console.log('blockers:', r.mergeBlockers.join(', ') || 'none');
    }
    if (!reports.length) {
      console.log('[dup-report] OK — no duplicate non-null installationId groups');
    }
  }
} catch (err) {
  console.error('[dup-report] ERROR:', err?.message || err);
  process.exit(1);
} finally {
  try {
    db.close();
  } catch {
    /* ignore */
  }
}
