#!/usr/bin/env node
/**
 * Phase C — import accepted friendships from legacy Cardbey API.
 *
 * Input JSON (no phones; id-mapped only):
 * {
 *   "pairs": [
 *     { "fromUserId": "<newUserId>", "toUserId": "<newUserId>" }
 *   ]
 * }
 *
 * Or with legacy map:
 * {
 *   "userIdMap": { "123": "clxyz...", "456": "clabc..." },
 *   "legacyPairs": [
 *     { "user_id": 123, "target_id": 456, "is_accept": 1 }
 *   ]
 * }
 *
 * Usage:
 *   node scripts/import-legacy-user-connections.mjs --file ./legacy-friends.json --dry-run
 *   node scripts/import-legacy-user-connections.mjs --file ./legacy-friends.json
 *
 * Requires DATABASE_URL and generated Prisma client.
 */

import fs from 'fs';
import path from 'path';
import { getPrismaClient, disconnectDatabase } from '../src/lib/prisma.js';
import { importLegacyAcceptedConnections } from '../src/services/connections/userConnectionService.js';

function parseArgs(argv) {
  const out = { file: null, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--file' && argv[i + 1]) {
      out.file = argv[++i];
    }
  }
  return out;
}

function resolvePairs(payload) {
  if (Array.isArray(payload?.pairs)) {
    return payload.pairs.map((p) => ({
      fromUserId: String(p.fromUserId || p.from || ''),
      toUserId: String(p.toUserId || p.to || ''),
    }));
  }

  const map = payload?.userIdMap && typeof payload.userIdMap === 'object' ? payload.userIdMap : null;
  const legacy = Array.isArray(payload?.legacyPairs) ? payload.legacyPairs : [];
  if (!map || !legacy.length) return [];

  const pairs = [];
  for (const row of legacy) {
    const accept = row.is_accept ?? row.isAccept ?? row.accepted;
    if (!(accept === 1 || accept === true || accept === '1' || accept === 'accepted')) continue;
    const fromLegacy = String(row.user_id ?? row.userId ?? '');
    const toLegacy = String(row.target_id ?? row.targetId ?? '');
    const fromUserId = map[fromLegacy];
    const toUserId = map[toLegacy];
    if (!fromUserId || !toUserId) continue;
    pairs.push({ fromUserId: String(fromUserId), toUserId: String(toUserId) });
  }
  return pairs;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node scripts/import-legacy-user-connections.mjs --file <json> [--dry-run]');
    process.exit(2);
  }
  const abs = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(2);
  }

  const payload = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const pairs = resolvePairs(payload);
  console.log(`[legacy-import] pairs=${pairs.length} dryRun=${args.dryRun} file=${abs}`);

  const prisma = getPrismaClient();
  try {
    const stats = await importLegacyAcceptedConnections(prisma, pairs, { dryRun: args.dryRun });
    console.log('[legacy-import] done', stats);
    if (stats.errors > 0) process.exitCode = 1;
  } finally {
    await disconnectDatabase().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[legacy-import] failed', err?.message || err);
  process.exit(1);
});
