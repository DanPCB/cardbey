/**
 * Recreate PUBLISHED_STORES_BACKFILL candidates from published Business rows
 * that still lack contact fields (phone, address, email, websiteUrl).
 *
 * Needed when Render's candidates.json was lost (ephemeral disk) or never
 * committed. Uses the same store root as the API (BUSINESS_CANDIDATE_DIR /
 * data/businessCandidates / tmp fallback).
 *
 * Usage (from apps/core/cardbey-core, with DATABASE_URL):
 *   pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts --dry-run
 *   pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts
 *   pnpm exec tsx scripts/seed-published-stores-backfill-candidates.ts --limit=3
 */

import 'dotenv/config';
import {
  buildCandidateDedupeKey,
  upsertBusinessCandidates,
} from '../src/lib/businessCandidate/candidateRepository.js';
import { resolveBusinessCandidateStoreRoot } from '../src/lib/businessCandidate/businessCandidateStoreRoot.js';
import type { BusinessCandidateRecord } from '../src/lib/businessCandidate/types.js';
import { getPrismaClient } from '../src/lib/prisma.js';

const BATCH_ID = 'PUBLISHED_STORES_BACKFILL';

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length).trim() || null;
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1].trim();
  }
  return null;
}

function isBlank(v: string | null | undefined): boolean {
  return !v || !String(v).trim();
}

function socialLinksFromBusiness(
  raw: unknown,
): Array<{ platform: string; url: string }> {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (e): e is { platform: string; url: string } =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as { platform?: unknown }).platform === 'string' &&
          typeof (e as { url?: unknown }).url === 'string',
      )
      .map((e) => ({ platform: e.platform, url: e.url }));
  }
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, url]) => typeof url === 'string' && String(url).trim())
    .map(([platform, url]) => ({ platform, url: String(url) }));
}

function candidateFromBusiness(row: {
  id: string;
  name: string;
  type: string;
  slug: string;
  description: string | null;
  address: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  lat: number | null;
  lng: number | null;
  socialLinks: unknown;
  createdAt: Date;
  updatedAt: Date;
}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  const name = row.name?.trim() || 'Unknown Business';
  const phone = row.phone?.trim() || null;
  const address = row.address?.trim() || null;
  const suburb = row.suburb?.trim() || row.city?.trim() || 'Melbourne';

  return {
    id: `published:${row.id}`,
    batchId: BATCH_ID,
    campaignId: null,
    name,
    businessType: row.type || null,
    address,
    suburb,
    city: row.city?.trim() || null,
    state: row.state?.trim() || null,
    postcode: row.postcode?.trim() || null,
    country: row.country?.trim() || 'AU',
    phone,
    website: row.websiteUrl?.trim() || null,
    email: row.email?.trim() || null,
    socialLinks: socialLinksFromBusiness(row.socialLinks),
    coordinates:
      row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
    discoveredFrom: 'manual',
    confidenceScore: 0.5,
    originalContent: {
      seededFromBusinessId: row.id,
      slug: row.slug,
      source: 'seed-published-stores-backfill-candidates',
    },
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: ['phone', 'address', 'email', 'website'].filter((f) => {
      if (f === 'phone') return isBlank(phone);
      if (f === 'address') return isBlank(address);
      if (f === 'email') return isBlank(row.email);
      if (f === 'website') return isBlank(row.websiteUrl);
      return false;
    }),
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: row.id,
    missionId: null,
    placeId: null,
    sourceUrl: null,
    rawSourceJson: { businessId: row.id, slug: row.slug },
    seedId: null,
    status: 'PENDING_QA',
    dedupeKey: buildCandidateDedupeKey({ name, phone, address, suburb }),
    discoveryProviderId: 'published_stores_backfill',
    externalId: row.id,
    createdAt: row.createdAt?.toISOString?.() ?? now,
    updatedAt: now,
    description: row.description,
    enrichmentStatus: 'unenriched',
    enrichmentNote: null,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitRaw = readArg('limit');
  const limit = limitRaw ? Math.max(1, Number.parseInt(limitRaw, 10) || 0) : null;
  if (limitRaw && (!limit || Number.isNaN(limit))) {
    console.error('Invalid --limit');
    process.exit(1);
  }

  const storeRoot = resolveBusinessCandidateStoreRoot();
  console.log(`[seed-backfill] candidate store root: ${storeRoot}`);

  const prisma = getPrismaClient();
  const rows = await prisma.business.findMany({
    where: {
      publishedAt: { not: null },
      AND: [
        { OR: [{ phone: null }, { phone: '' }] },
        { OR: [{ address: null }, { address: '' }] },
        { OR: [{ email: null }, { email: '' }] },
        { OR: [{ websiteUrl: null }, { websiteUrl: '' }] },
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      slug: true,
      description: true,
      address: true,
      suburb: true,
      city: true,
      state: true,
      postcode: true,
      country: true,
      phone: true,
      email: true,
      websiteUrl: true,
      lat: true,
      lng: true,
      socialLinks: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { publishedAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  const candidates = rows.map(candidateFromBusiness);

  console.log(
    JSON.stringify(
      {
        dryRun,
        matchedBusinesses: rows.length,
        batchId: BATCH_ID,
        sample: candidates.slice(0, 3).map((c) => ({
          id: c.id,
          name: c.name,
          storeId: c.storeId,
          status: c.status,
          suburb: c.suburb,
          socialLinks: c.socialLinks,
        })),
      },
      null,
      2,
    ),
  );

  if (!candidates.length) {
    console.log('[seed-backfill] no thin published businesses matched — nothing to write');
    return;
  }

  if (dryRun) {
    console.log('[seed-backfill] dry-run only — no writes');
    return;
  }

  const saved = await upsertBusinessCandidates(candidates);
  console.log(`[seed-backfill] upserted ${saved.length} candidates into ${storeRoot}/candidates.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
