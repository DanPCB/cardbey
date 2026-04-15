/**
 * Seed Library ingestion CLI. Fetches from a provider (e.g. Pexels), downloads images,
 * dedupes by sha256, upserts SeedAsset + SeedAssetFile, and records a SeedIngestionJob.
 * Guardrails: rate limiting, retry with exponential backoff, reject/banlist, metrics.
 *
 * Usage: pnpm seed:ingest --provider pexels --vertical food --limit 200
 * Env: PEXELS_API_KEY, DATABASE_URL, optional SEED_LIBRARY_STORAGE_PATH,
 *      SEED_INGEST_RATE_LIMIT_PER_MINUTE, SEED_INGEST_MAX_RETRIES, SEED_INGEST_BACKOFF_BASE_MS,
 *      SEED_REJECT_SHA256, SEED_REJECT_PROVIDER_IDS
 *
 * Does not modify DraftStore, Business, Product, or any store-creation workflow.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { searchPhotos } from '../src/lib/seedLibrary/adapters/pexelsAdapter.js';
import { saveSeedAssetBuffer, sha256Buffer } from '../src/lib/seedLibrary/seedStorage.js';
import { withRetry, rateLimitDelay, getRejectSha256Set, getRejectProviderIdsSet } from '../src/lib/seedLibrary/ingestGuardrails.js';

const prisma = new PrismaClient();

const PER_PAGE = 20;
const VERTICAL_QUERIES = {
  food: ['food dish', 'restaurant meal', 'dessert pastry', 'burger', 'coffee cafe'],
  beauty: ['nails salon', 'pedicure', 'manicure', 'beauty product', 'salon'],
  services: ['service professional', 'consulting', 'workspace'],
};

function parseArgs() {
  const args = process.argv.slice(2);
  let provider = 'pexels';
  let vertical = 'food';
  let limit = 200;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && args[i + 1]) provider = args[i + 1];
    if (args[i] === '--vertical' && args[i + 1]) vertical = args[i + 1];
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[i + 1], 10) || 200;
  }

  return { provider, vertical, limit };
}

async function downloadBuffer(url) {
  return withRetry(async () => {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${url.slice(0, 60)}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

async function resizeToMedium(buffer, mimeType) {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 0;
    if (w <= 800) return buffer;
    const out = await sharp(buffer).resize(800, null, { withoutEnlargement: true }).toBuffer();
    return out;
  } catch {
    return null;
  }
}

function orientation(width, height) {
  if (!width || !height) return null;
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

function extFromUrl(url) {
  const u = url || '';
  if (u.includes('.jpg') || u.includes('.jpeg')) return 'jpg';
  if (u.includes('.png')) return 'png';
  if (u.includes('.webp')) return 'webp';
  return 'jpg';
}

async function run() {
  const { provider, vertical, limit } = parseArgs();

  if (provider !== 'pexels') {
    console.error('Only provider=pexels is implemented. Set PEXELS_API_KEY.');
    process.exit(1);
  }

  if (!process.env.PEXELS_API_KEY) {
    console.error('PEXELS_API_KEY is required.');
    process.exit(1);
  }

  const queries = VERTICAL_QUERIES[vertical] || [`${vertical} product photo`];
  const job = await prisma.seedIngestionJob.create({
    data: {
      provider,
      status: 'running',
      meta: { vertical, limit, queries },
    },
  });

  console.log(`[seed:ingest] Job ${job.id} started. Provider=${provider} vertical=${vertical} limit=${limit}`);

  let totalFetched = 0;
  let upserted = 0;
  let downloaded = 0;
  let skippedDedupe = 0;
  let rejected = 0;
  let errors = 0;
  const errorMessages = [];
  const rejectSha256Set = getRejectSha256Set();
  const rejectProviderIdsSet = getRejectProviderIdsSet(provider);

  try {
    const seenIds = new Set();
    let page = 1;
    let done = false;

    while (!done && totalFetched < limit) {
      const perPage = Math.min(PER_PAGE, limit - totalFetched);
      const query = queries[Math.floor(Math.random() * queries.length)];

      let result;
      try {
        result = await withRetry(() => searchPhotos(query, page, perPage));
      } catch (err) {
        errorMessages.push(`${query} p${page}: ${err.message}`);
        errors++;
        break;
      }

      await rateLimitDelay();

      const photos = result.photos || [];
      if (photos.length === 0) done = true;

      for (const photo of photos) {
        if (totalFetched >= limit) break;
        if (seenIds.has(photo.id)) continue;
        seenIds.add(photo.id);
        totalFetched++;

        if (rejectProviderIdsSet.has(`${provider}:${photo.id}`.toLowerCase())) {
          rejected++;
          continue;
        }

        const existingByProvider = await prisma.seedAsset.findUnique({
          where: { provider_providerAssetId: { provider, providerAssetId: photo.id } },
          select: { status: true },
        });
        if (existingByProvider?.status === 'rejected') {
          rejected++;
          continue;
        }

        try {
          const imageUrl = photo.url;
          if (!imageUrl) continue;

          const buffer = await downloadBuffer(imageUrl);
          downloaded++;
          const hash = sha256Buffer(buffer);

          if (rejectSha256Set.has(hash.toLowerCase())) {
            rejected++;
            continue;
          }

          const existingBySha = await prisma.seedAsset.findUnique({ where: { sha256: hash }, select: { status: true } });
          if (existingBySha) {
            if (existingBySha.status === 'rejected') {
              rejected++;
              continue;
            }
            skippedDedupe++;
            continue;
          }

          const ext = extFromUrl(imageUrl);
          const { key: keyFull, url: urlFull } = saveSeedAssetBuffer(buffer, provider, photo.id, ext, 'full');

          let mediumUrl = null;
          let mediumKey = null;
          const resized = await resizeToMedium(buffer, `image/${ext}`);
          if (resized && resized.length < buffer.length) {
            const m = saveSeedAssetBuffer(resized, provider, photo.id, ext, 'medium');
            mediumUrl = m.url;
            mediumKey = m.key;
          } else if (photo.src?.medium) {
            mediumUrl = photo.src.medium;
          }

          const asset = await prisma.seedAsset.upsert({
            where: {
              provider_providerAssetId: { provider, providerAssetId: photo.id },
            },
            create: {
              provider,
              providerAssetId: photo.id,
              sourcePageUrl: photo.sourcePageUrl ?? null,
              photographerName: photo.photographerName ?? null,
              photographerUrl: photo.photographerUrl ?? null,
              licenseName: 'Pexels License',
              licenseUrl: photo.licenseUrl ?? 'https://www.pexels.com/license/',
              attributionText: photo.attributionText ?? null,
              width: photo.width ?? null,
              height: photo.height ?? null,
              orientation: orientation(photo.width, photo.height),
              tags: photo.alt ? [photo.alt] : null,
              vertical,
              categoryKey: query.slice(0, 50),
              sha256: hash,
              status: 'active',
              ingestionJobId: job.id,
            },
            update: {
              updatedAt: new Date(),
              ingestionJobId: job.id,
              sourcePageUrl: photo.sourcePageUrl ?? undefined,
              attributionText: photo.attributionText ?? undefined,
              licenseUrl: photo.licenseUrl ?? undefined,
            },
          });

          await prisma.seedAssetFile.deleteMany({ where: { seedAssetId: asset.id } });
          const fileRows = [
            { seedAssetId: asset.id, fileUrl: urlFull, role: 'full', width: photo.width ?? null, height: photo.height ?? null, mimeType: `image/${ext}` },
          ];
          if (mediumUrl) fileRows.push({ seedAssetId: asset.id, fileUrl: mediumUrl, role: 'medium', width: null, height: null, mimeType: null });
          await prisma.seedAssetFile.createMany({ data: fileRows });

          upserted++;
          if (upserted % 10 === 0) {
            console.log(`[seed:ingest] upserted=${upserted} downloaded=${downloaded} deduped=${skippedDedupe} rejected=${rejected} failed=${errors}`);
          }
        } catch (err) {
          errors++;
          errorMessages.push(`Photo ${photo.id}: ${err.message}`);
        }
      }

      page++;
      if (photos.length < perPage) done = true;
    }

    const meta = {
      ...(typeof job.meta === 'object' && job.meta ? job.meta : {}),
      fetched: totalFetched,
      upserted,
      downloaded,
      deduped: skippedDedupe,
      rejected,
      failed: errors,
    };
    await prisma.seedIngestionJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        meta,
        errorMessage: errorMessages.length ? errorMessages.slice(0, 5).join('; ') : null,
      },
    });

    console.log(`[seed:ingest] Job ${job.id} completed. fetched=${totalFetched} upserted=${upserted} downloaded=${downloaded} deduped=${skippedDedupe} rejected=${rejected} failed=${errors}`);
  } catch (err) {
    const meta = { fetched: totalFetched, upserted, downloaded, deduped: skippedDedupe, rejected, failed: errors };
    await prisma.seedIngestionJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: err.message,
        meta,
      },
    });
    console.error('[seed:ingest] Job failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
