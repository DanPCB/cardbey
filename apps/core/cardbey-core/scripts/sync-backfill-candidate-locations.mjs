#!/usr/bin/env node
/**
 * Phase 2 — copy real suburb/city/formattedAddress from Business onto
 * PUBLISHED_STORES_BACKFILL candidates (fixes generic suburb: Melbourne).
 *
 * Uses the same candidate store root as the API (BUSINESS_CANDIDATE_DIR /
 * data/businessCandidates / tmp fallback).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/sync-backfill-candidate-locations.mjs --dry-run
 *   node scripts/sync-backfill-candidate-locations.mjs
 */

import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const BATCH_ID = 'PUBLISHED_STORES_BACKFILL';
const dryRun = process.argv.includes('--dry-run');

function isWritableDirectory(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    writeFileSync(probe, 'ok', 'utf8');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveStoreRoot() {
  const configured = process.env.BUSINESS_CANDIDATE_DIR?.trim();
  const candidates = [
    configured,
    path.join(CORE_ROOT, 'data', 'businessCandidates'),
    path.join(os.tmpdir(), 'cardbey', 'businessCandidates'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (isWritableDirectory(dir)) return dir;
  }
  throw new Error(`No writable candidate store (tried: ${candidates.join(', ')})`);
}

async function loadPrisma() {
  try {
    const mod = await import(pathToFileURL(path.join(CORE_ROOT, 'src/lib/prisma.js')).href);
    if (typeof mod.getPrismaClient === 'function') return mod.getPrismaClient();
  } catch {
    /* fall through */
  }
  try {
    const gen = require('../node_modules/.prisma/client-gen');
    return new gen.PrismaClient();
  } catch {
    const pkg = require('@prisma/client');
    const PrismaClient = pkg.PrismaClient || pkg.default?.PrismaClient || pkg.default;
    return new PrismaClient();
  }
}

async function main() {
  const storeRoot = resolveStoreRoot();
  const candidatesPath = path.join(storeRoot, 'candidates.json');
  console.log(`[sync-locations] candidates path: ${candidatesPath}`);

  if (!existsSync(candidatesPath)) {
    console.error('candidates.json missing — seed PUBLISHED_STORES_BACKFILL first');
    process.exit(1);
  }

  const prisma = await loadPrisma();
  const stores = await prisma.business.findMany({
    where: { publishedAt: { not: null } },
    select: {
      id: true,
      suburb: true,
      city: true,
      formattedAddress: true,
      address: true,
      country: true,
      lat: true,
      lng: true,
    },
  });

  const byId = Object.fromEntries(
    stores.map((s) => [
      s.id,
      {
        suburb: s.suburb || s.city || null,
        city: s.city || null,
        country: s.country || 'AU',
        formattedAddress: s.formattedAddress || s.address || null,
        address: s.address || s.formattedAddress || null,
        lat: s.lat,
        lng: s.lng,
      },
    ]),
  );

  const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  if (!Array.isArray(candidates)) {
    console.error('candidates.json must be an array');
    process.exit(1);
  }

  let updated = 0;
  const patched = candidates.map((c) => {
    if (!c || typeof c !== 'object') return c;
    if (c.batchId !== BATCH_ID && !String(c.id || '').startsWith('published:')) return c;
    const storeId =
      (typeof c.storeId === 'string' && c.storeId.trim()) ||
      (String(c.id || '').startsWith('published:') ? String(c.id).slice('published:'.length) : null);
    const storeData = storeId ? byId[storeId] : null;
    if (!storeData) return c;

    const changes = {};
    if (storeData.suburb && storeData.suburb !== 'Melbourne') changes.suburb = storeData.suburb;
    if (storeData.city) changes.city = storeData.city;
    if (storeData.country) changes.country = storeData.country;
    if (storeData.formattedAddress) {
      changes.address = c.address || storeData.address || storeData.formattedAddress;
    }
    if (storeData.lat != null && storeData.lng != null && !c.coordinates) {
      changes.coordinates = { lat: storeData.lat, lng: storeData.lng };
    }

    if (Object.keys(changes).length) {
      updated += 1;
      return { ...c, ...changes, updatedAt: new Date().toISOString() };
    }
    return c;
  });

  console.log(
    `${dryRun ? '[dry-run] would update' : 'Updated'} suburb/location on ${updated} candidates`,
  );

  if (!dryRun) {
    writeFileSync(candidatesPath, `${JSON.stringify(patched, null, 2)}\n`, 'utf8');
  }

  if (typeof prisma.$disconnect === 'function') await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[sync-locations] Fatal:', e);
  process.exit(1);
});
