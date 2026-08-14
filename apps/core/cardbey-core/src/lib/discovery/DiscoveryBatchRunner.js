/**
 * DiscoveryBatchRunner — crawl seeds, scrape, normalize, pre-build stores.
 */

import { prisma } from '../prisma.js';
import { scrapeAndNormalize } from '../social-import/SocialImportService.js';
import { extractBusinessUrls } from './sources/DirectoryCrawler.js';
import { resolveTikTokHashtag } from './sources/tiktokHashtagResolver.js';
import { buildClaimAuthority } from './ClaimAuthorityBuilder.js';
import * as UnclaimedStoreService from './UnclaimedStoreService.js';
import * as PreBuiltStoreService from './PreBuiltStoreService.js';
import * as DiscoveryConfigService from './DiscoveryConfigService.js';
import {
  RESULT_CODES,
  SKIP_REASONS,
  isRetryableCode,
} from './diagnostics/discoveryResultCodes.js';
import {
  classifyScrapeFailure,
  classifyBatchOutcome,
  sanitizeDiagnosticEvent,
} from './diagnostics/classifyDiscoveryFailure.js';
import {
  deriveSourceHealth,
  shouldSkipCronForHealth,
} from './diagnostics/sourceHealth.js';

/** Resolve outcomes that are not technical batch failures. */
const NON_FAILURE_RESOLVE_STATUSES = new Set(['OK', 'NO_RESULTS', 'PROVIDER_BLOCKED']);

/** Map resolver status strings → Diagnostics V2 result codes. */
function mapResolveStatusToCode(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'OK') return RESULT_CODES.SUCCESS;
  if (s === 'NO_RESULTS') return RESULT_CODES.NO_RESULTS;
  if (s === 'PROVIDER_BLOCKED') return RESULT_CODES.PROVIDER_BLOCKED;
  if (s === 'RATE_LIMITED') return RESULT_CODES.RATE_LIMITED;
  if (s === 'NETWORK_ERROR') return RESULT_CODES.NETWORK_ERROR;
  if (s === 'CONFIG_ERROR') return RESULT_CODES.CONFIG_ERROR;
  if (s === 'RESOLVER_PARSE_ERROR' || s === 'PARSE_ERROR') return RESULT_CODES.PARSE_ERROR;
  if (s === 'AUTH_ERROR') return RESULT_CODES.AUTH_ERROR;
  if (s === 'INVALID_SOURCE') return RESULT_CODES.INVALID_SOURCE;
  return RESULT_CODES.UPSTREAM_ERROR;
}

function parseBatchRowLocal(row) {
  let configSnapshot = null;
  let errorLog = null;
  try {
    configSnapshot = row.configSnapshot ? JSON.parse(row.configSnapshot) : null;
  } catch { /* ignore */ }
  try {
    errorLog = row.errorLog ? JSON.parse(row.errorLog) : null;
  } catch { /* ignore */ }
  return { ...row, configSnapshot, errorLog };
}

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
 * @returns {Promise<{ urls: string[], resolveStatus: string, resolveDetail: string, resolveMeta?: object }>}
 */
export async function resolveUrlsFromSeed(seed, maxUrls) {
  const type = String(seed.type || '').toLowerCase();
  const value = String(seed.value || '').trim();

  if (type === 'url_list' || type === 'web_crawl') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const urls = parsed
          .filter((u) => typeof u === 'string' && u.startsWith('http'))
          .slice(0, maxUrls);
        return urls.length > 0
          ? { urls, resolveStatus: 'OK', resolveDetail: `url_list_${urls.length}` }
          : {
              urls: [],
              resolveStatus: 'CONFIG_ERROR',
              resolveDetail: 'url_list_empty_or_invalid',
            };
      }
    } catch {
      if (value.startsWith('http')) {
        return { urls: [value].slice(0, maxUrls), resolveStatus: 'OK', resolveDetail: 'url_list_single' };
      }
    }
    return { urls: [], resolveStatus: 'CONFIG_ERROR', resolveDetail: 'url_list_parse_failed' };
  }

  if (type === 'directory_crawl') {
    if (!value.startsWith('http')) {
      return { urls: [], resolveStatus: 'CONFIG_ERROR', resolveDetail: 'directory_crawl_needs_http' };
    }
    const urls = (await extractBusinessUrls(value, maxUrls)).slice(0, maxUrls);
    return urls.length > 0
      ? { urls, resolveStatus: 'OK', resolveDetail: `directory_${urls.length}` }
      : { urls: [], resolveStatus: 'NO_RESULTS', resolveDetail: 'directory_zero_links' };
  }

  if (type === 'tiktok_hashtag') {
    // Plain HTTP only — do not headless-bypass TikTok anti-bot (PROVIDER_BLOCKED when shell).
    const resolved = await resolveTikTokHashtag(value, { maxUrls });
    return {
      urls: resolved.urls,
      resolveStatus: resolved.status,
      resolveDetail: resolved.detail,
      resolveMeta: {
        classification: resolved.classification,
        tagUrl: resolved.tagUrl,
        httpStatus: resolved.httpStatus,
        contentType: resolved.contentType,
        responseBytes: resolved.responseBytes,
      },
    };
  }

  if (type === 'google_maps') {
    if (value.startsWith('http')) {
      return { urls: [value].slice(0, maxUrls), resolveStatus: 'OK', resolveDetail: 'google_maps_url' };
    }
    return {
      urls: [],
      resolveStatus: 'CONFIG_ERROR',
      resolveDetail: 'google_maps_query_unsupported_use_place_url',
    };
  }

  if (value.startsWith('http')) {
    return { urls: [value].slice(0, maxUrls), resolveStatus: 'OK', resolveDetail: 'raw_http_value' };
  }

  return { urls: [], resolveStatus: 'CONFIG_ERROR', resolveDetail: 'unsupported_seed_value' };
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
    const classified = classifyScrapeFailure('scrape_failed');
    errors.push(sanitizeDiagnosticEvent({
      url,
      code: classified.code,
      message: classified.message,
      error: classified.message,
      retryable: classified.retryable,
      pipelineStoppedAt: 'processUrl:scrapeAndNormalize',
    }));
    await recordSeedError(seedId, `${classified.code}:${classified.message}`);
    return;
  }

  const { raw, normalized } = scraped;
  const enriched = {
    ...normalized,
    bioText: raw?.description || raw?.bio || '',
    avatarUrl: normalized.logoUrl || raw?.profilePhoto || '',
    followerCount: raw?.followerCount ?? null,
    sourcePlatform: normalized.platform,
    category: raw?.category || normalized.businessType,
    phone: normalized.phone ?? raw?.phone ?? null,
    email: normalized.email ?? raw?.email ?? null,
    address: normalized.address ?? raw?.address ?? null,
    hours: normalized.hours ?? raw?.hours ?? null,
    priceRange: normalized.priceRange ?? raw?.priceRange ?? null,
    websiteUrl: normalized.websiteUrl ?? (normalized.platform === 'website' ? normalized.sourceUrl : null),
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
    errors.push(sanitizeDiagnosticEvent({
      url,
      code: RESULT_CODES.SKIPPED,
      skipReason: SKIP_REASONS.ALREADY_EXISTS,
      message: 'Unclaimed store already exists for sourceUrl',
      error: 'ALREADY_EXISTS',
      retryable: false,
      pipelineStoppedAt: 'processUrl:upsertFromPayload',
    }));
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
  const chunkSize = Math.max(1, concurrency);

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (url) => {
      try {
        await processUrl(url, batchRun, seedId, errors);
      } catch (error) {
        batchRun.failed += 1;
        const classified = classifyScrapeFailure(error?.message || String(error));
        errors.push(sanitizeDiagnosticEvent({
          url,
          code: classified.code,
          message: classified.message,
          error: classified.message,
          retryable: classified.retryable,
          pipelineStoppedAt: 'processUrl:exception',
        }));
        await recordSeedError(seedId, `${classified.code}:${classified.message}`);
      }
    }));
    if (delayMs > 0 && i + chunkSize < urls.length) {
      await sleep(delayMs);
    }
  }

  return errors;
}

function buildConfigSnapshot(config, runSessionId, result = null) {
  return JSON.stringify({
    batchSize: config.batchSize,
    concurrency: config.concurrency,
    delayMs: config.delayMs,
    cronExpression: config.cronExpression,
    maxRunsPerDay: config.maxRunsPerDay,
    runSessionId,
    ...(result ? { result } : {}),
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
    const resolved = await resolveUrlsFromSeed(seed, maxUrls);
    const urls = Array.isArray(resolved?.urls) ? resolved.urls : [];
    const resolveStatus = String(resolved?.resolveStatus || (urls.length ? 'OK' : 'NETWORK_ERROR'));
    const resolveDetail = String(resolved?.resolveDetail || '');
    counters.discovered = urls.length;
    counters.resolveStatus = resolveStatus;

    /** @type {object[]} */
    let errors = [];

    if (urls.length > 0) {
      errors = await runWithConcurrency(urls, counters, seed.id, concurrency, delayMs);
    } else {
      const code = mapResolveStatusToCode(resolveStatus);
      const resolveError = sanitizeDiagnosticEvent({
        code,
        error: resolveStatus,
        message: resolveDetail
          || (code === RESULT_CODES.CONFIG_ERROR
            ? 'google_maps free-text is unsupported — use a Place URL (Places API not wired into seed resolve)'
            : code === RESULT_CODES.PROVIDER_BLOCKED
              ? 'TikTok hashtag discovery blocked from this runtime'
              : resolveStatus),
        retryable: isRetryableCode(code),
        seedType: seed.type,
        seedValue: String(seed.value).slice(0, 120),
        detail: resolveDetail,
        pipelineStoppedAt: 'resolveUrlsFromSeed',
        ...(resolved?.resolveMeta || {}),
      });
      errors = [resolveError];

      // Legitimate empty search / provider block are not technical failures.
      if (!NON_FAILURE_RESOLVE_STATUSES.has(resolveStatus)) {
        counters.failed = 1;
      }

      await recordSeedError(
        seed.id,
        `${code}:${resolveStatus} for ${seed.type}:${String(seed.value).slice(0, 80)}${
          resolveDetail ? ` (${resolveDetail})` : ''
        }`,
      );
    }

    const outcome = classifyBatchOutcome(counters, errors, {
      resolveCode: urls.length === 0 ? mapResolveStatusToCode(resolveStatus) : null,
    });

    const status = counters.failed > 0 && counters.created === 0 ? 'failed'
      : counters.failed > 0 ? 'partial' : 'completed';

    const completedAt = new Date();
    const resultPayload = {
      code: outcome.code,
      message: outcome.message,
      retryable: outcome.retryable,
      skipReason: outcome.skipReason,
      resolveStatus,
    };

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
        configSnapshot: buildConfigSnapshot(activeConfig, sessionId, resultPayload),
      },
    });

    await prisma.discoverySeedSource.update({
      where: { id: seed.id },
      data: {
        lastRunAt: completedAt,
        runCount: { increment: 1 },
        lastError: outcome.code === RESULT_CODES.SUCCESS
          ? null
          : `${outcome.code}:${String(outcome.message || '').slice(0, 480)}`,
      },
    });

    if (counters.created > 0) {
      await clearSeedErrors(seed.id);
    }

    return {
      ...counters,
      completedAt,
      status,
      resultCode: outcome.code,
      resultMessage: outcome.message,
      retryable: outcome.retryable,
      skipReason: outcome.skipReason,
    };
  } catch (error) {
    const completedAt = new Date();
    const classified = {
      code: RESULT_CODES.INTERNAL_ERROR,
      message: error?.message || String(error),
      retryable: true,
    };
    await prisma.discoveryBatchRun.update({
      where: { id: batchRun.id },
      data: {
        status: 'failed',
        completedAt,
        errorLog: JSON.stringify([sanitizeDiagnosticEvent({
          code: classified.code,
          message: classified.message,
          error: classified.message,
          retryable: true,
          pipelineStoppedAt: 'runBatch',
        })]),
        configSnapshot: buildConfigSnapshot(activeConfig, sessionId, classified),
      },
    });
    await recordSeedError(seed.id, `${classified.code}:${classified.message}`);
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

    if (triggeredBy === 'cron') {
      const recent = await prisma.discoveryBatchRun.findMany({
        where: { seedSourceId: seed.id },
        orderBy: { startedAt: 'desc' },
        take: 8,
      });
      const healthInfo = deriveSourceHealth(recent.map(parseBatchRowLocal));
      if (shouldSkipCronForHealth(healthInfo, triggeredBy)) {
        summaries.push({
          seedSourceId: seed.id,
          seedType: seed.type,
          seedValue: seed.value,
          status: 'skipped_cooldown',
          resultCode: healthInfo.lastResultCode,
          resultMessage: `Cron cooldown (${healthInfo.lastResultCode}): ${healthInfo.suggestedAction}`,
          runSessionId,
          discovered: 0,
          created: 0,
          skipped: 0,
          failed: 0,
        });
        continue;
      }
    }

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
        resultCode: RESULT_CODES.INTERNAL_ERROR,
        error: error?.message || String(error),
        runSessionId,
      });
    }
  }

  return summaries;
}
