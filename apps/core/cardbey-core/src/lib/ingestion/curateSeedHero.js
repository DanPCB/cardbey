/**
 * SuperAdmin hero curation for ingestion seeds.
 */

import { QA_FLAG_HERO_MISSING } from '../businessIngestion/QaQualityGates.js';
import { getSeedRecordById, upsertSeedRecords } from '../businessIngestion/IngestionRepository.js';
import { uploadBuffer } from '../storage/index.js';
import { HERO_MIN_HEIGHT, HERO_MIN_WIDTH } from './computeSeedCompleteness.js';
import { persistSeedCompleteness } from './persistSeedCompleteness.js';
import { appendSeedCurationEvent } from './seedCurationEvents.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const CURATABLE = new Set(['seeded_pending_qa']);
const NOT_CURATABLE = new Set([
  'claim_pending',
  'verified_owner',
  'active',
  'seeded_claimable',
]);

function jsonError(status, code, extra = {}) {
  return { ok: false, status, code, ...extra };
}

function sniffMime(buffer, declared) {
  const declaredNorm = String(declared ?? '').split(';')[0].trim().toLowerCase();
  if (declaredNorm === 'image/svg+xml' || declaredNorm === 'image/svg') return 'image/svg+xml';
  if (declaredNorm.startsWith('text/html')) return 'text/html';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.toString('utf8', 0, Math.min(buffer.length, 200)).includes('<svg')) return 'image/svg+xml';
  return declaredNorm || 'application/octet-stream';
}

async function fetchImageBuffer(imageUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'image/jpeg,image/png,image/webp' },
    });
    if (!res.ok) {
      return jsonError(422, 'HERO_FETCH_FAILED', { detail: `HTTP ${res.status}` });
    }
    const contentType = res.headers.get('content-type') || '';
    const length = Number(res.headers.get('content-length') || 0);
    if (length > MAX_BYTES) {
      return jsonError(422, 'HERO_FETCH_FAILED', { detail: 'image exceeds 15 MB' });
    }
    const mimeHint = contentType.split(';')[0].trim().toLowerCase();
    if (mimeHint === 'image/svg+xml' || mimeHint === 'text/html') {
      return jsonError(422, 'HERO_FETCH_FAILED', { detail: `unsupported content-type ${mimeHint}` });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      return jsonError(422, 'HERO_FETCH_FAILED', { detail: 'image exceeds 15 MB' });
    }
    return { ok: true, buffer, contentType };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return jsonError(422, 'HERO_FETCH_FAILED', {
      detail: aborted ? 'fetch timed out' : err?.message || 'fetch failed',
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64Image(imageBase64) {
  const raw = String(imageBase64 ?? '').trim();
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  const mime = match ? match[1] : 'image/jpeg';
  const payload = match ? match[2] : raw;
  try {
    const buffer = Buffer.from(payload, 'base64');
    if (!buffer.length) return jsonError(422, 'HERO_FETCH_FAILED', { detail: 'empty imageBase64' });
    if (buffer.length > MAX_BYTES) return jsonError(422, 'HERO_FETCH_FAILED', { detail: 'image exceeds 15 MB' });
    return { ok: true, buffer, contentType: mime };
  } catch {
    return jsonError(422, 'HERO_FETCH_FAILED', { detail: 'invalid imageBase64' });
  }
}

async function processHeroBuffer(buffer, mime) {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < HERO_MIN_WIDTH || height < HERO_MIN_HEIGHT) {
    return jsonError(422, 'HERO_LOW_RES', { width, height });
  }
  const processed = await sharp(buffer)
    .rotate()
    .resize(1600, 900, { fit: 'cover', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const stored = await uploadBuffer(processed, `seed-hero-${Date.now()}.jpg`, 'image/jpeg', 'images');
  return {
    ok: true,
    url: stored.url,
    width: Math.min(width, 1600),
    height: Math.min(height, 900),
    mime,
  };
}

function clearHeroMissingFlags(seed) {
  const flags = Array.isArray(seed.qaFlags) ? seed.qaFlags.map(String) : [];
  return flags.filter((flag) => flag !== QA_FLAG_HERO_MISSING);
}

/**
 * @param {{ seedId: string, adminId: string, imageUrl?: string | null, imageBase64?: string | null, altText?: string | null, note?: string | null }} params
 */
export async function curateSeedHero(params) {
  const hasUrl = Boolean(String(params.imageUrl ?? '').trim());
  const hasB64 = Boolean(String(params.imageBase64 ?? '').trim());
  if (hasUrl === hasB64) {
    return jsonError(400, 'INVALID_INPUT', { detail: 'exactly one of imageUrl or imageBase64 is required' });
  }

  const seed = await getSeedRecordById(params.seedId);
  if (!seed) return jsonError(404, 'NOT_FOUND', { detail: 'Seed not found.' });

  const status = seed.verificationStatus;
  if (seed.storeId || NOT_CURATABLE.has(status) || !CURATABLE.has(status)) {
    return jsonError(409, 'SEED_NOT_CURATABLE', { state: status });
  }

  const loaded = hasUrl
    ? await fetchImageBuffer(String(params.imageUrl).trim())
    : decodeBase64Image(params.imageBase64);
  if (!loaded.ok) return loaded;

  const mime = sniffMime(loaded.buffer, loaded.contentType);
  if (mime === 'image/svg+xml' || mime === 'text/html' || !ALLOWED_MIME.has(mime)) {
    return jsonError(422, 'HERO_FETCH_FAILED', { detail: `unsupported content-type ${mime}` });
  }

  const processed = await processHeroBuffer(loaded.buffer, mime);
  if (!processed.ok) return processed;

  const previousHero = seed.hero ?? {
    url: seed.enrichmentProfile?.heroImageUrl ?? null,
    provenance: seed.enrichmentProfile?.visualSource ?? null,
  };

  const hero = {
    url: processed.url,
    width: processed.width,
    height: processed.height,
    provenance: 'admin_curated',
    isLogoSuspect: false,
    altText: params.altText?.trim() || null,
  };

  const patched = {
    ...seed,
    hero,
    qaFlags: clearHeroMissingFlags(seed),
    enrichmentProfile: {
      ...(seed.enrichmentProfile ?? {}),
      heroImageUrl: hero.url,
      heroWidth: hero.width,
      heroHeight: hero.height,
      visualSource: 'admin_curated',
      enrichedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };

  await upsertSeedRecords([patched]);
  await appendSeedCurationEvent({
    seedId: seed.id,
    field: 'hero',
    adminId: params.adminId,
    note: params.note ?? null,
    previousValue: previousHero,
  });
  const persisted = await persistSeedCompleteness(seed.id);
  const completeness = persisted.completeness ?? {
    tier: persisted.seed?.completenessTier,
    blockers: [],
    gaps: [],
  };

  return {
    ok: true,
    status: 200,
    hero: {
      url: hero.url,
      width: hero.width,
      height: hero.height,
      provenance: 'admin_curated',
    },
    completeness: {
      tier: completeness.tier,
      blockers: completeness.blockers ?? [],
      gaps: completeness.gaps ?? [],
      score: completeness.score,
    },
    seed: persisted.seed ?? patched,
  };
}
