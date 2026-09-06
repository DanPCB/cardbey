#!/usr/bin/env node
/**
 * Google Places backfill for published stores missing contact data.
 *
 * Uses: Google Places Text Search → Place Details (New API first, legacy fallback)
 * Writes to: Business.phone, websiteUrl, address, suburb, lat/lng, tradingHours
 * Also upserts PUBLISHED_STORES_BACKFILL candidate.rawSourceJson when present.
 *
 * Default: DRY RUN (no DB writes).
 *
 * Run (from apps/core/cardbey-core):
 *   node scripts/google-places-backfill.mjs
 *   node scripts/google-places-backfill.mjs --dry-run
 *   BACKFILL_APPLY=1 node scripts/google-places-backfill.mjs
 *   node scripts/google-places-backfill.mjs --apply
 *   node scripts/google-places-backfill.mjs --limit=5
 *   node scripts/google-places-backfill.mjs --slug=pho-ngon-footscray
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, accessSync, constants, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..', '..');
const require = createRequire(import.meta.url);

const RATE_LIMIT_MS = 200;
const BATCH_ID = 'PUBLISHED_STORES_BACKFILL';
const SKIP_SLUGS = new Set([
  'gas',
  'my-business',
  'burger',
  'nails',
  'hp-services-4',
  'hp-services-5',
  'hp-services-6',
  'hp-services-visibility',
]);

const apply =
  process.argv.includes('--apply') || String(process.env.BACKFILL_APPLY || '') === '1';
const isDryRun = !apply;
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number.parseInt(limitArg.slice('--limit='.length), 10) || 0) : null;
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const ONLY_SLUG = slugArg ? slugArg.slice('--slug='.length).trim() : null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readArgEnvKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
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

function resolveCandidateStoreRoot() {
  const configured = process.env.BUSINESS_CANDIDATE_DIR?.trim();
  const candidates = [
    configured,
    path.join(CORE_ROOT, 'data', 'businessCandidates'),
    path.join(os.tmpdir(), 'cardbey', 'businessCandidates'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (isWritableDirectory(dir)) return dir;
  }
  return null;
}

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/**
 * Places API (New) text search.
 */
async function textSearchNew(key, query, regionCode) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.nationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
  ].join(',');
  const { ok, data } = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: regionCode || 'AU',
      pageSize: 5,
    }),
  });
  if (!ok || data?.error) return null;
  const places = Array.isArray(data?.places) ? data.places : [];
  if (!places.length) return null;
  const p = places[0];
  return {
    place_id: p.id,
    name: p.displayName?.text || null,
    formatted_address: p.formattedAddress || null,
    geometry: {
      location: {
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
      },
    },
    phone: p.nationalPhoneNumber || null,
    website: p.websiteUri || null,
    via: 'new',
  };
}

async function textSearchLegacy(key, query) {
  const url =
    'https://maps.googleapis.com/maps/api/place/textsearch/json' +
    `?query=${encodeURIComponent(query)}` +
    `&key=${encodeURIComponent(key)}`;
  const { data } = await fetchJson(url);
  if (data?.status !== 'OK' || !data.results?.length) return null;
  const r = data.results[0];
  return {
    place_id: r.place_id,
    name: r.name,
    formatted_address: r.formatted_address,
    geometry: r.geometry,
    via: 'legacy',
  };
}

async function textSearch(key, name, location, countryCode) {
  const query = `${name} ${location}`.trim();
  const regionCode = countryCode === 'VN' ? 'VN' : 'AU';
  try {
    const fromNew = await textSearchNew(key, query, regionCode);
    if (fromNew) return fromNew;
  } catch (e) {
    console.warn(`[places] textSearch new failed for "${name}":`, e.message);
  }
  try {
    return await textSearchLegacy(key, `${query} ${countryCode === 'VN' ? 'Vietnam' : 'Australia'}`);
  } catch (e) {
    console.warn(`[places] textSearch legacy failed for "${name}":`, e.message);
    return null;
  }
}

async function placeDetailsNew(key, placeId) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'nationalPhoneNumber',
    'internationalPhoneNumber',
    'websiteUri',
    'regularOpeningHours',
    'location',
    'googleMapsUri',
  ].join(',');
  const { ok, data } = await fetchJson(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
    },
  });
  if (!ok || !data || data.error) return null;
  const weekday = data.regularOpeningHours?.weekdayDescriptions;
  return {
    name: data.displayName?.text || null,
    formatted_phone_number: data.nationalPhoneNumber || null,
    international_phone_number: data.internationalPhoneNumber || null,
    website: data.websiteUri || null,
    formatted_address: data.formattedAddress || null,
    opening_hours: weekday
      ? {
          weekday_text: weekday,
          periods: data.regularOpeningHours?.periods ?? [],
          open_now: data.regularOpeningHours?.openNow ?? null,
        }
      : null,
    geometry: {
      location: {
        lat: data.location?.latitude ?? null,
        lng: data.location?.longitude ?? null,
      },
    },
    via: 'new',
  };
}

async function placeDetailsLegacy(key, placeId) {
  const fields = [
    'name',
    'formatted_phone_number',
    'international_phone_number',
    'website',
    'formatted_address',
    'opening_hours',
    'geometry',
  ].join(',');
  const url =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${fields}` +
    `&key=${encodeURIComponent(key)}`;
  const { data } = await fetchJson(url);
  if (data?.status !== 'OK' || !data.result) return null;
  return { ...data.result, via: 'legacy' };
}

async function placeDetails(key, placeId) {
  try {
    const fromNew = await placeDetailsNew(key, placeId);
    if (fromNew) return fromNew;
  } catch (e) {
    console.warn(`[places] details new failed for ${placeId}:`, e.message);
  }
  try {
    return await placeDetailsLegacy(key, placeId);
  } catch (e) {
    console.warn(`[places] details legacy failed for ${placeId}:`, e.message);
    return null;
  }
}

function isBlank(v) {
  return v == null || !String(v).trim();
}

function extractSuburbFromAddress(address) {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const suburbPart = parts[parts.length - 2];
  // AU: "Footscray VIC 3011"
  const au = suburbPart.match(/^([A-Za-zÀ-ÿ'\-\s]+)\s+[A-Z]{2,3}\s+\d{4}$/);
  if (au?.[1]) return au[1].trim();
  // Soft fallback: whole suburb part if it has no digits
  if (suburbPart && !/\d/.test(suburbPart) && suburbPart.length < 40) return suburbPart;
  return null;
}

/**
 * Reject wrong-country / far-away matches. Better null than wrong data.
 */
function addressMatchesExpectedLocation(address, store) {
  if (!address) return false;
  const a = address.toLowerCase();
  const country = (store.country || 'AU').toUpperCase();

  if (country === 'VN') {
    return /vietnam|việt|hcmc|ho chi minh|saigon|sài gòn|hanoi|hà nội/.test(a);
  }

  // AU expected
  const auHints = /\baustralia\b|\bvic\b|\bnsw\b|\bqld\b|\bsa\b|\bwa\b|\btas\b|\bact\b|\bnt\b/;
  if (!auHints.test(a) && !/\b\d{4}\b/.test(a)) return false;

  const expectedTokens = [
    store.suburb,
    store.city,
    store.formattedAddress,
  ]
    .filter((t) => t && String(t).trim() && String(t).trim().toLowerCase() !== 'melbourne')
    .map((t) => String(t).toLowerCase());

  // If we have a specific suburb/city/address, require at least one token hit
  if (expectedTokens.length) {
    const hit = expectedTokens.some((tok) => {
      const words = tok.split(/[\s,]+/).filter((w) => w.length > 2);
      return words.some((w) => a.includes(w));
    });
    if (!hit) {
      // Still allow Melbourne metro if address is clearly AU and store only had Melbourne
      return /\bmelbourne\b|\bvic\b/.test(a);
    }
  }

  // Generic Melbourne-only store: require AU / VIC / Melbourne
  return /\baustralia\b|\bvic\b|\bmelbourne\b/.test(a);
}

function buildPlacesPatch(store, result, searchResult) {
  const patch = {};

  const phone =
    result.formatted_phone_number?.trim() ||
    result.international_phone_number?.trim() ||
    searchResult?.phone?.trim() ||
    null;
  if (phone && isBlank(store.phone)) patch.phone = phone;

  const website = (result.website || searchResult?.website || '').trim() || null;
  if (website && isBlank(store.websiteUrl)) patch.websiteUrl = website;

  const address =
    result.formatted_address?.trim() || searchResult?.formatted_address?.trim() || null;
  if (address && isBlank(store.address)) patch.address = address;
  if (address && isBlank(store.formattedAddress)) patch.formattedAddress = address;

  if (address && (isBlank(store.suburb) || store.suburb === 'Melbourne')) {
    const suburb = extractSuburbFromAddress(address);
    if (suburb) patch.suburb = suburb;
  }

  const lat =
    result.geometry?.location?.lat ?? searchResult?.geometry?.location?.lat ?? null;
  const lng =
    result.geometry?.location?.lng ?? searchResult?.geometry?.location?.lng ?? null;
  if (lat != null && lng != null && store.lat == null) {
    patch.lat = lat;
    patch.lng = lng;
  }

  const hours = result.opening_hours;
  if (hours && (store.tradingHours == null || store.tradingHours === undefined)) {
    patch.tradingHours = {
      openNow: hours.open_now ?? null,
      weekdayText: hours.weekday_text ?? [],
      periods: hours.periods ?? [],
    };
  }

  return patch;
}

function buildLocationHint(store) {
  if (store.formattedAddress?.trim()) return store.formattedAddress.trim();
  if (store.suburb && store.suburb !== 'Melbourne') return store.suburb;
  if (store.city && store.city !== 'Melbourne') return store.city;
  if (store.country === 'VN') return 'Ho Chi Minh City';
  return 'Melbourne Australia';
}

async function upsertCandidateRawSource(storeId, placePayload) {
  const root = resolveCandidateStoreRoot();
  if (!root) return false;
  const file = path.join(root, 'candidates.json');
  if (!existsSync(file)) return false;
  let candidates;
  try {
    candidates = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  if (!Array.isArray(candidates)) return false;

  let changed = false;
  const next = candidates.map((c) => {
    if (!c || typeof c !== 'object') return c;
    if (c.batchId !== BATCH_ID && c.storeId !== storeId && c.id !== `published:${storeId}`) {
      return c;
    }
    if (c.storeId !== storeId && c.id !== `published:${storeId}`) return c;
    changed = true;
    const suburb =
      placePayload.suburb && placePayload.suburb !== 'Melbourne'
        ? placePayload.suburb
        : c.suburb;
    return {
      ...c,
      suburb: suburb ?? c.suburb,
      address: placePayload.address || c.address,
      phone: placePayload.phone || c.phone,
      website: placePayload.website || c.website,
      country: placePayload.country || c.country || 'AU',
      coordinates:
        placePayload.lat != null && placePayload.lng != null
          ? { lat: placePayload.lat, lng: placePayload.lng }
          : c.coordinates,
      socialLinks: Array.isArray(c.socialLinks) ? c.socialLinks : [],
      rawSourceJson: {
        ...(c.rawSourceJson && typeof c.rawSourceJson === 'object' ? c.rawSourceJson : {}),
        ...placePayload.rawSourceJson,
      },
      enrichmentStatus: c.enrichmentStatus === 'enriched' ? c.enrichmentStatus : 'unenriched',
      updatedAt: new Date().toISOString(),
    };
  });

  if (!changed || isDryRun) return changed;
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return true;
}

async function main() {
  const key = readArgEnvKey();
  if (!key) {
    console.error('No GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) set');
    process.exit(1);
  }

  console.log(`[places-backfill] Mode: ${isDryRun ? 'DRY RUN' : 'LIVE APPLY'}`);
  const prisma = await loadPrisma();

  const where = {
    publishedAt: { not: null },
    OR: [{ phone: null }, { phone: '' }],
    NOT: { slug: { in: [...SKIP_SLUGS] } },
  };
  if (ONLY_SLUG) {
    where.slug = ONLY_SLUG;
    delete where.NOT;
  }

  const stores = await prisma.business.findMany({
    where,
    select: {
      id: true,
      slug: true,
      name: true,
      phone: true,
      websiteUrl: true,
      address: true,
      formattedAddress: true,
      suburb: true,
      city: true,
      country: true,
      lat: true,
      lng: true,
      tradingHours: true,
    },
    orderBy: { publishedAt: 'desc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  console.log(`[places-backfill] ${stores.length} stores to process`);

  const results = [];
  let patched = 0;
  let notFound = 0;
  let noData = 0;
  let skippedWrongLocation = 0;

  for (const store of stores) {
    const location = buildLocationHint(store);
    const country = store.country === 'VN' ? 'VN' : 'AU';

    console.log(`\n[places-backfill] Looking up: ${store.name} (${location}) [${store.slug}]`);

    const searchResult = await textSearch(key, store.name, location, country);
    await sleep(RATE_LIMIT_MS);

    if (!searchResult?.place_id) {
      console.log('  → Not found in Google Places');
      notFound += 1;
      results.push({ slug: store.slug, status: 'not_found' });
      continue;
    }

    console.log(
      `  → Found: ${searchResult.name} (${searchResult.formatted_address}) via=${searchResult.via}`,
    );

    if (!addressMatchesExpectedLocation(searchResult.formatted_address, store)) {
      console.log('  → SKIPPED: address does not match expected location (confidence)');
      skippedWrongLocation += 1;
      results.push({
        slug: store.slug,
        status: 'skipped_wrong_location',
        foundAddress: searchResult.formatted_address,
      });
      continue;
    }

    const detail = await placeDetails(key, searchResult.place_id);
    await sleep(RATE_LIMIT_MS);

    if (!detail) {
      console.log('  → Details fetch failed');
      notFound += 1;
      results.push({ slug: store.slug, status: 'details_failed' });
      continue;
    }

    const foundAddress = detail.formatted_address || searchResult.formatted_address;
    if (!addressMatchesExpectedLocation(foundAddress, store)) {
      console.log('  → SKIPPED: details address does not match expected location');
      skippedWrongLocation += 1;
      results.push({
        slug: store.slug,
        status: 'skipped_wrong_location',
        foundAddress,
      });
      continue;
    }

    const patch = buildPlacesPatch(store, detail, searchResult);
    console.log(`  → Patch fields: ${JSON.stringify(Object.keys(patch))}`);
    if (patch.phone) console.log(`  → phone: ${patch.phone}`);
    if (patch.websiteUrl) console.log(`  → website: ${patch.websiteUrl}`);
    if (patch.address) console.log(`  → address: ${patch.address}`);
    if (patch.suburb) console.log(`  → suburb: ${patch.suburb}`);

    const placePayload = {
      phone: patch.phone || null,
      website: patch.websiteUrl || null,
      address: patch.address || foundAddress || null,
      suburb: patch.suburb || null,
      country,
      lat: patch.lat ?? null,
      lng: patch.lng ?? null,
      rawSourceJson: {
        placeId: searchResult.place_id,
        sourceId: searchResult.place_id,
        name: detail.name || searchResult.name,
        address: foundAddress,
        phone: patch.phone || detail.formatted_phone_number || null,
        website: patch.websiteUrl || detail.website || null,
        types: [],
        discoveryVia: `google_places_backfill_${detail.via || searchResult.via || 'unknown'}`,
        openingHours: detail.opening_hours
          ? { weekday_text: detail.opening_hours.weekday_text || [] }
          : null,
      },
    };

    if (Object.keys(patch).length === 0) {
      console.log('  → No new data to write');
      noData += 1;
      results.push({ slug: store.slug, status: 'no_new_data', placeId: searchResult.place_id });
      if (!isDryRun) {
        await upsertCandidateRawSource(store.id, placePayload);
      }
      continue;
    }

    results.push({
      slug: store.slug,
      status: 'patched',
      fields: Object.keys(patch),
      phone: patch.phone ?? null,
      address: patch.address ?? null,
      suburb: patch.suburb ?? null,
      placeId: searchResult.place_id,
    });

    if (!isDryRun) {
      await prisma.business.update({
        where: { id: store.id },
        data: { ...patch, updatedAt: new Date() },
      });
      await upsertCandidateRawSource(store.id, placePayload);
      console.log('  → ✓ Written to DB');
    } else {
      console.log('  → (dry-run) would write');
    }
    patched += 1;
  }

  console.log('\n[places-backfill] === SUMMARY ===');
  console.log(`Processed:            ${stores.length}`);
  console.log(`Patched:              ${patched}${isDryRun ? ' (dry run)' : ''}`);
  console.log(`Not found / failed:   ${notFound}`);
  console.log(`Skipped wrong loc:    ${skippedWrongLocation}`);
  console.log(`No new data:          ${noData}`);

  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  const reportPath = path.join(
    reportDir,
    `PLACES_BACKFILL_${new Date().toISOString().slice(0, 10)}.json`,
  );
  try {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    console.log(`Report: ${reportPath}`);
  } catch (e) {
    console.warn('[places-backfill] report write failed:', e.message);
  }

  if (typeof prisma.$disconnect === 'function') await prisma.$disconnect();

  if (isDryRun) {
    console.log('\nRun with BACKFILL_APPLY=1 (or --apply) to write to DB');
  }
}

main().catch((e) => {
  console.error('[places-backfill] Fatal:', e);
  process.exit(1);
});
