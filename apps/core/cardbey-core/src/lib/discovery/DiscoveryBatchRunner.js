/**
 * DiscoveryBatchRunner — crawl seeds, scrape, normalize, pre-build stores.
 */

import { prisma } from '../prisma.js';
import { scrapeAndNormalize } from '../social-import/SocialImportService.js';
import { fetchHtml } from '../social-import/scrapeUtils.js';
import { buildClaimAuthority } from './ClaimAuthorityBuilder.js';
import * as UnclaimedStoreService from './UnclaimedStoreService.js';
import * as PreBuiltStoreService from './PreBuiltStoreService.js';
import * as DiscoveryConfigService from './DiscoveryConfigService.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if another instance is already running a batch (multi-instance guard).
 */
export async function isDiscoveryLocked() {
  if (process.env.DISCOVERY_INSTANCE_LOCK !== 'true') return false;
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const running = await prisma.discoveryBatchRun.findFirst({
    where: { status: 'running', startedAt: { gte: cutoff } },
    select: { id: true },
  });
  return !!running;
}

/**
 * Resolve candidate profile URLs from a seed source.
 */
export async function resolveUrlsFromSeed(seed, maxUrls) {
  const type = String(seed.type || '').toLowerCase();
  const value = String(seed.value || '').trim();

  if (type === 'url_list') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, maxUrls);
      }
    } catch {
      if (value.startsWith('http')) return [value].slice(0, maxUrls);
    }
    return [];
  }

  if (type === 'tiktok_hashtag') {
    const tag = value.replace(/^#/, '');
    const tagUrl = `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
    const html = await fetchHtml(tagUrl);
    if (!html) return [];
    return extractTikTokProfileUrls(html).slice(0, maxUrls);
  }

  if (type === 'google_maps') {
    if (value.startsWith('http')) return [value].slice(0, maxUrls);
    return [];
  }

  if (value.startsWith('http')) {
    return [value].slice(0, maxUrls);
  }

  return [];
}

function extractTikTokProfileUrls(html) {
  const seen = new Set();
  const urls = [];
  const re = /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = `https://www.tiktok.com/@${m[1]}`;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

async function recordSeedError(seedId, message) {
  try {
    await prisma.discoverySeedSource.update({
      where: { id: seedId },
      data: {
        errorCount: { increment: 1 },
        lastError: String(message).slice(0, 500),
      },
    });
  } catch {
    /* non-fatal */
  }
}

async function clearSeedErrors(seedId) {
  try {
    await prisma.discoverySeedSource.update({
      where: { id: seedId },
      data: { errorCount: 0, lastError: null },
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Process a single URL through the full pipeline.
 */
async function processUrl(url, batchRun, seedId, errors) {
  const scraped = await scrapeAndNormalize(url);
  if (!scraped) {
    batchRun.failed += 1;
    errors.push({ url, error: 'scrape_failed' });
    await recordSeedError(seedId, 'scrape_failed');
    return;
  }

  const { raw, normalized } = scraped;
  const enriched = {
    ...normalized,
    bioText: raw?.description || '',
    avatarUrl: normalized.logoUrl || raw?.profilePhoto || '',
    followerCount: raw?.followerCount ?? null,
    sourcePlatform: normalized.platform,
    category: raw?.category || normalized.businessType,
  };

  const claimAuthority = buildClaimAuthority(raw, normalized);
  const result = await UnclaimedStoreService.upsertFromPayload(
    {
      ...enriched,
      claimAuthority: JSON.stringify(claimAuthority),
    },
    batchRun.id,
  );

  if (result.existed) {
    batchRun.skipped += 1;
    return;
  }

  const preBuilt = await PreBuiltStoreService.buildPreBuiltStore(enriched, result.id);
  if (preBuilt) {
    await UnclaimedStoreService.setPreBuiltStore(result.id, preBuilt.draftStoreId);
    batchRun.preBuilt += 1;
  }

  batchRun.created += 1;
  batchRun.scraped += 1;
}

async function runWithConcurrency(urls, batchRun, seedId, concurrency, delayMs) {
  const errors = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const i = index;
      index += 1;
      const url = urls[i];
      try {
        await processUrl(url, batchRun, seedId, errors);
      } catch (error) {
        batchRun.failed += 1;
        const msg = error?.message || String(error);
        errors.push({ url, error: msg });
        await recordSeedError(seedId, msg);
      }
      if (delayMs > 0 && index < urls.length) {
        await sleep(delayMs);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(urls.length, 1)) }, () => worker());
  await Promise.all(workers);
  return errors;
}

function buildConfigSnapshot(config, runSessionId) {
  return JSON.stringify({
    batchSize: config.batchSize,
    concurrency: config.concurrency,
    delayMs: config.delayMs,
    cronExpression: config.cronExpression,
    maxRunsPerDay: config.maxRunsPerDay,
    runSessionId,
  });
}

/**
 * Run a single seed source batch.
 */
export async function runBatch(seed, sourceLimit, triggeredBy = 'cron', triggeredById = null, config = null, runSessionId = null) {
  const activeConfig = config || await DiscoveryConfigService.getConfig();
  const maxUrls = Math.max(1, sourceLimit ?? seed.batchLimit ?? activeConfig.batchSize);
  const concurrency = activeConfig.concurrency;
  const delayMs = activeConfig.delayMs;
  const sessionId = runSessionId || `run_${Date.now()}`;

  const batchRun = await prisma.discoveryBatchRun.create({
    data: {
      status: 'running',
      seedSourceId: seed.id,
      seedType: seed.type,
      seedValue: seed.value,
      triggeredBy,
      triggeredById,
      configSnapshot: buildConfigSnapshot(activeConfig, sessionId),
    },
  });

  const counters = {
    id: batchRun.id,
    seedSourceId: seed.id,
    seedType: seed.type,
    seedValue: seed.value,
    startedAt: batchRun.startedAt,
    triggeredBy,
    triggeredById,
    runSessionId: sessionId,
    discovered: 0,
    scraped: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    preBuilt: 0,
  };

  try {
    const urls = await resolveUrlsFromSeed(seed, maxUrls);
    counters.discovered = urls.length;

    const errors = urls.length > 0
      ? await runWithConcurrency(urls, counters, seed.id, concurrency, delayMs)
      : [];

    const status = counters.failed > 0 && counters.created === 0 ? 'failed'
      : counters.failed > 0 ? 'partial' : 'completed';

    const completedAt = new Date();
    await prisma.discoveryBatchRun.update({
      where: { id: batchRun.id },
      data: {
        status,
        completedAt,
        discovered: counters.discovered,
        scraped: counters.scraped,
        created: counters.created,
        skipped: counters.skipped,
        failed: counters.failed,
        preBuilt: counters.preBuilt,
        errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    await prisma.discoverySeedSource.update({
      where: { id: seed.id },
      data: {
        lastRunAt: completedAt,
        runCount: { increment: 1 },
      },
    });

    if (counters.created > 0) {
      await clearSeedErrors(seed.id);
    }

    return {
      ...counters,
      completedAt,
      status,
    };
  } catch (error) {
    const completedAt = new Date();
    await prisma.discoveryBatchRun.update({
      where: { id: batchRun.id },
      data: {
        status: 'failed',
        completedAt,
        errorLog: JSON.stringify([{ error: error?.message || String(error) }]),
      },
    });
    await recordSeedError(seed.id, error?.message || String(error));
    throw error;
  }
}

/**
 * Run all active seed sources with global batch quota.
 */
export async function runAllActive(triggeredBy = 'cron', triggeredById = null) {
  await UnclaimedStoreService.expireStale(30);

  const config = await DiscoveryConfigService.getConfig();
  const runSessionId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let remainingQuota = config.batchSize;

  const seeds = await prisma.discoverySeedSource.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  const summaries = [];
  for (const seed of seeds) {
    if (remainingQuota <= 0) break;

    const sourceLimit = Math.min(
      seed.batchLimit ?? config.batchSize,
      remainingQuota,
    );

    try {
      const summary = await runBatch(
        seed,
        sourceLimit,
        triggeredBy,
        triggeredById,
        config,
        runSessionId,
      );
      remainingQuota -= summary.created;
      summaries.push(summary);
    } catch (error) {
      console.error(`[DiscoveryBatch] Seed ${seed.id} failed:`, error?.message || error);
      summaries.push({
        seedType: seed.type,
        seedValue: seed.value,
        status: 'failed',
        error: error?.message || String(error),
        runSessionId,
      });
    }
  }

  return summaries;
}
