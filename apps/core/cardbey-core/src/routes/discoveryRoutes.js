/**
 * Business Discovery / Ingestion routes (Phase 1).
 *
 *   GET  /api/discovery/business/search?q=&location=   → search permitted sources
 *   POST /api/discovery/business/import                → create unclaimed/draft record
 *   POST /api/discovery/business/:id/claim             → claim/verify (placeholder)
 *   POST /api/discovery/business/:id/generate-channel  → build a Cardbey store from imported data
 *   GET  /api/discovery/business/:id                   → fetch one record
 *
 * Content acquisition pipeline (agent crawl → pre-built stores → claim):
 *   GET  /api/discovery/stores
 *   GET  /api/discovery/stores/:slug
 *   POST /api/discovery/stores/:id/claim
 *   POST /api/discovery/stores/:id/claim/verify
 *   POST /api/discovery/stores/:id/claim/cancel
 *   GET  /api/discovery/batches          (admin)
 *   POST /api/discovery/run              (admin)
 *   POST /api/discovery/seeds            (admin)
 *   PATCH /api/discovery/seeds/:id       (admin)
 *   GET  /api/discovery/stats            (admin)
 *
 * Ethics: search only hits permitted sources (official Places API when configured,
 * user-supplied website extraction, manual input). No Google page scraping.
 */

import express from 'express';
import cuid from 'cuid';
import { requireAuth, optionalAuth, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import * as UnclaimedStoreService from '../lib/discovery/UnclaimedStoreService.js';
import * as PreBuiltStoreService from '../lib/discovery/PreBuiltStoreService.js';
import { runAllActive } from '../lib/discovery/DiscoveryBatchRunner.js';
import * as DiscoveryConfigService from '../lib/discovery/DiscoveryConfigService.js';
import { reloadDiscoverySchedule, reloadSchedule, isDiscoveryRunning } from '../lib/discovery/DiscoveryScheduler.js';
import {
  enrichSeedsWithDiagnostics,
  enrichBatchWithResult,
} from '../lib/discovery/diagnostics/enrichSeedDiagnostics.js';
import { appendDiscoveryReport } from '../scheduler/reportScheduler.js';
import {
  generateOtp,
  setClaimOtp,
  verifyClaimOtp,
  clearClaimOtp,
} from '../lib/discovery/claimOtpStore.js';
import {
  searchBusinesses,
  importBusiness,
  claimBusiness,
  getCandidateById,
  attachGeneratedStore,
  candidateToBuildStorePayload,
} from '../lib/businessDiscovery/index.js';
import { runDiscoverySearch } from '../lib/discoverySearch/discoverySearchService.js';
import { DISCOVERY_ENTITY_TYPES } from '../lib/discoverySearch/discoverySearchTypes.js';
import {
  createBuildStoreJob,
  runBuildStoreJob,
  newTraceId,
} from '../services/draftStore/orchestraBuildStore.js';

const router = express.Router();

const OTP_CLAIM_METHODS = new Set(['phone_otp', 'email_otp']);
const VALID_SEED_TYPES = new Set(['tiktok_hashtag', 'google_maps', 'url_list']);
const VALID_SEED_PLATFORMS = new Set(['tiktok', 'google', 'facebook', 'instagram']);

function computeNextRun(expr) {
  try {
    const parts = String(expr || '').trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [min, hour] = parts;
    const now = new Date();
    if (hour.startsWith('*/')) {
      const n = parseInt(hour.slice(2), 10);
      if (Number.isNaN(n) || n < 1) return null;
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      const currentHour = next.getHours();
      const remainder = currentHour % n;
      const addHours = remainder === 0 && now.getMinutes() === 0 ? n : (n - remainder) || n;
      next.setHours(currentHour + addHours);
      if (next <= now) next.setHours(next.getHours() + n);
      return next.toISOString();
    }
    const h = parseInt(hour, 10);
    if (!Number.isNaN(h) && min === '0') {
      const next = new Date(now);
      next.setHours(h, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

function formatNextRunLabel(iso) {
  if (!iso) return 'Scheduled';
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'Scheduled';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  return `in ${hours}h ${mins % 60}m`;
}

async function reloadDiscoveryConfigSchedule() {
  await reloadDiscoverySchedule();
  await reloadSchedule();
}

async function resolveClaimDraftStoreId(store, userId) {
  if (store.preBuiltStoreId) {
    const transferred = await PreBuiltStoreService.transferToClaimer(store.preBuiltStoreId, userId);
    if (transferred) return transferred.id;
  }
  const draft = await UnclaimedStoreService.createDraftFromUnclaimed(store, userId);
  return draft.id;
}

function parseDiscoveryEntityTypes(raw) {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((t) => DISCOVERY_ENTITY_TYPES.includes(t));
}

function parseDiscoveryFloatOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/discovery/search?query=&entityTypes=&location=&category=&page=&suggest= */
router.get('/search', optionalAuth, async (req, res, next) => {
  try {
    const query = String(req.query.query ?? req.query.q ?? '').trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20), 50);
    const suggest = req.query.suggest === 'true' || req.query.suggest === '1';

    const result = await runDiscoverySearch({
      query,
      entityTypes: parseDiscoveryEntityTypes(req.query.entityTypes ?? req.query.type),
      location: typeof req.query.location === 'string' ? req.query.location : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      page,
      limit,
      lat: parseDiscoveryFloatOrNull(req.query.lat),
      lng: parseDiscoveryFloatOrNull(req.query.lng),
      suggest,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[discovery/search]', error);
    next(error);
  }
});

/** GET /api/discovery/business/search?q=&location= */
router.get('/business/search', optionalAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const location = typeof req.query.location === 'string' ? req.query.location : null;
    if (!q.trim()) {
      return res.status(400).json({ ok: false, error: 'missing_query', message: 'q is required' });
    }
    const result = await searchBusinesses({ q, location });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[discovery] search error:', error);
    next(error);
  }
});

/** POST /api/discovery/business/import */
router.post('/business/import', optionalAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await importBusiness({
      candidateId: body.candidateId ?? null,
      name: body.name ?? null,
      category: body.category ?? null,
      address: body.address ?? null,
      phone: body.phone ?? null,
      website: body.website ?? null,
      location: body.location ?? null,
      source: body.source ?? null,
      sourceUrl: body.sourceUrl ?? null,
      socialLinks: body.socialLinks ?? null,
      photos: body.photos ?? null,
      openingHours: body.openingHours ?? null,
      rating: body.rating ?? null,
      reviewCount: body.reviewCount ?? null,
      confidence: body.confidence ?? null,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[discovery] import error:', error);
    next(error);
  }
});

/** GET /api/discovery/business/:id */
router.get('/business/:id', optionalAuth, async (req, res, next) => {
  try {
    const record = await getCandidateById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.status(200).json({ ok: true, candidate: record });
  } catch (error) {
    console.error('[discovery] get error:', error);
    next(error);
  }
});

/** POST /api/discovery/business/:id/claim */
router.post('/business/:id/claim', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    // Phase 1 placeholder: real ownership verification (email/phone/domain) is not yet wired,
    // so unverified claims become `pending_verification`. A verified proof flips to `claimed`.
    const result = await claimBusiness(req.params.id, {
      userId: req.userId,
      verified: body.verified === true,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[discovery] claim error:', error);
    next(error);
  }
});

/** POST /api/discovery/business/:id/generate-channel (uses the existing build-store pipeline) */
router.post('/business/:id/generate-channel', requireAuth, async (req, res, next) => {
  try {
    const record = await getCandidateById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    if (!record.name) {
      return res.status(400).json({ ok: false, error: 'missing_business_name' });
    }

    const { sourceType, payload } = candidateToBuildStorePayload(record);
    const businessName = String(payload.businessName);
    const rawInput =
      [businessName, payload.businessType, payload.location].filter(Boolean).join(', ') ||
      businessName;
    const loc =
      typeof payload.location === 'string' && payload.location.trim()
        ? payload.location.trim()
        : undefined;

    const result = await createBuildStoreJob(prisma, {
      tenantId: req.userId,
      userId: req.userId,
      businessName,
      businessType: payload.businessType ?? undefined,
      storeType: payload.businessType ?? undefined,
      rawInput,
      location: loc,
      intentMode: 'store',
      sourceType,
      storeId: 'temp',
      includeImages: req.body?.autoImages !== false,
    });

    if (result.needRun && result.createdDraftId) {
      runBuildStoreJob(
        prisma,
        result.jobId,
        result.createdDraftId,
        result.generationRunId,
        newTraceId(),
        { originSurface: 'business_discovery' },
      );
    }

    await attachGeneratedStore(record.id, result.storeId);

    return res.status(200).json({
      ok: true,
      jobId: result.jobId,
      tenantId: result.tenantId,
      storeId: result.storeId,
      generationRunId: result.generationRunId,
      discoveryId: record.id,
    });
  } catch (error) {
    console.error('[discovery] generate-channel error:', error);
    next(error);
  }
});

// ── Content acquisition pipeline: public routes ──

/** GET /api/discovery/stores */
router.get('/stores', optionalAuth, async (req, res, next) => {
  try {
    const result = await UnclaimedStoreService.listByStatus('unclaimed', {
      platform: typeof req.query.platform === 'string' ? req.query.platform : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      location: typeof req.query.location === 'string' ? req.query.location : undefined,
      limit: req.query.limit,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[discovery] list stores error:', error);
    next(error);
  }
});

/** GET /api/discovery/stores/:slug */
router.get('/stores/:slug', optionalAuth, async (req, res, next) => {
  try {
    const store = await UnclaimedStoreService.getBySlug(req.params.slug);
    if (!store) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.status(200).json({ ok: true, store });
  } catch (error) {
    console.error('[discovery] get store by slug error:', error);
    next(error);
  }
});

// ── Admin routes (platform_admin / super_admin / legacy admin) ──

function parseBatchRow(batch) {
  let configSnapshot = null;
  let errorLog = null;
  try {
    configSnapshot = batch.configSnapshot ? JSON.parse(batch.configSnapshot) : null;
  } catch { /* ignore */ }
  try {
    errorLog = batch.errorLog ? JSON.parse(batch.errorLog) : null;
  } catch { /* ignore */ }
  return { ...batch, configSnapshot, errorLog };
}

/** GET /api/discovery/config */
router.get('/config', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await DiscoveryConfigService.getConfig();
    const runnable = await DiscoveryConfigService.isRunnable();
    const nextRun = computeNextRun(config.cronExpression);
    return res.status(200).json({
      ok: true,
      config,
      runnable,
      nextRun,
      isCurrentlyRunning: isDiscoveryRunning(),
    });
  } catch (error) {
    console.error('[discovery] config get error:', error);
    next(error);
  }
});

/** PATCH /api/discovery/config */
router.patch('/config', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await DiscoveryConfigService.updateConfig(req.body ?? {}, req.userId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, details: result.details });
    }
    await reloadDiscoveryConfigSchedule();
    return res.status(200).json({ ok: true, config: result.config });
  } catch (error) {
    console.error('[discovery] config patch error:', error);
    next(error);
  }
});

/** POST /api/discovery/config/enable */
router.post('/config/enable', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await DiscoveryConfigService.setEnabled(true, req.userId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    await reloadDiscoveryConfigSchedule();
    return res.status(200).json({ ok: true, enabled: true });
  } catch (error) {
    console.error('[discovery] config enable error:', error);
    next(error);
  }
});

/** POST /api/discovery/config/disable */
router.post('/config/disable', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await DiscoveryConfigService.setEnabled(false, req.userId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    await reloadDiscoveryConfigSchedule();
    return res.status(200).json({ ok: true, enabled: false });
  } catch (error) {
    console.error('[discovery] config disable error:', error);
    next(error);
  }
});

/** POST /api/discovery/config/pause */
router.post('/config/pause', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const hours = Number(req.body?.hours);
    const result = await DiscoveryConfigService.pauseUntil(hours, req.userId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || 'invalid_hours' });
    }
    await reloadDiscoveryConfigSchedule();
    return res.status(200).json({ ok: true, pausedUntil: result.config?.pausedUntil ?? null });
  } catch (error) {
    console.error('[discovery] config pause error:', error);
    next(error);
  }
});

/** POST /api/discovery/config/resume */
router.post('/config/resume', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await DiscoveryConfigService.resume(req.userId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    await reloadDiscoveryConfigSchedule();
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[discovery] config resume error:', error);
    next(error);
  }
});

/** GET /api/discovery/seeds */
router.get('/seeds', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const seeds = await prisma.discoverySeedSource.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    const enriched = await enrichSeedsWithDiagnostics(seeds);
    return res.status(200).json({ ok: true, seeds: enriched });
  } catch (error) {
    console.error('[discovery] seeds list error:', error);
    next(error);
  }
});

/** POST /api/discovery/seeds */
router.post('/seeds', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (!body.type || !body.platform || !body.value) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    const type = String(body.type);
    const platform = String(body.platform).toLowerCase();
    if (!VALID_SEED_TYPES.has(type)) {
      return res.status(400).json({ ok: false, error: 'invalid_type' });
    }
    if (!VALID_SEED_PLATFORMS.has(platform)) {
      return res.status(400).json({ ok: false, error: 'invalid_platform' });
    }
    const seed = await prisma.discoverySeedSource.create({
      data: {
        type,
        platform,
        value: String(body.value),
        location: body.location ? String(body.location) : null,
        category: body.category ? String(body.category) : null,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
        batchLimit: body.batchLimit != null ? Number(body.batchLimit) : null,
        isActive: body.isActive !== false,
      },
    });
    return res.status(201).json({ ok: true, seed });
  } catch (error) {
    console.error('[discovery] create seed error:', error);
    next(error);
  }
});

/** PATCH /api/discovery/seeds/:id */
router.patch('/seeds/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const data = {};
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (body.priority !== undefined) data.priority = Number(body.priority) || 0;
    if (body.batchLimit !== undefined) data.batchLimit = body.batchLimit == null ? null : Number(body.batchLimit);
    if (body.value !== undefined) data.value = String(body.value);
    if (body.location !== undefined) data.location = body.location ? String(body.location) : null;
    if (body.category !== undefined) data.category = body.category ? String(body.category) : null;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, error: 'no_fields' });
    }
    const seed = await prisma.discoverySeedSource.update({
      where: { id: req.params.id },
      data,
    });
    return res.status(200).json({ ok: true, seed });
  } catch (error) {
    console.error('[discovery] patch seed error:', error);
    next(error);
  }
});

/** DELETE /api/discovery/seeds/:id */
router.delete('/seeds/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const seed = await prisma.discoverySeedSource.findUnique({ where: { id: req.params.id } });
    if (!seed) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    if (seed.runCount > 0) {
      await prisma.discoverySeedSource.update({
        where: { id: seed.id },
        data: { isActive: false },
      });
      return res.status(200).json({ ok: true, deleted: false, deactivated: true });
    }
    await prisma.discoverySeedSource.delete({ where: { id: seed.id } });
    return res.status(200).json({ ok: true, deleted: true, deactivated: false });
  } catch (error) {
    console.error('[discovery] delete seed error:', error);
    next(error);
  }
});

/** GET /api/discovery/batches */
router.get('/batches', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const seedSourceId = typeof req.query.seedSourceId === 'string' ? req.query.seedSourceId : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const batches = await prisma.discoveryBatchRun.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(seedSourceId ? { seedSourceId } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return res.status(200).json({
      ok: true,
      batches: batches.map((b) => enrichBatchWithResult(parseBatchRow(b))),
    });
  } catch (error) {
    console.error('[discovery] batches error:', error);
    next(error);
  }
});

/** GET /api/discovery/batches/:id */
router.get('/batches/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const batch = await prisma.discoveryBatchRun.findUnique({ where: { id: req.params.id } });
    if (!batch) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.status(200).json({
      ok: true,
      batch: enrichBatchWithResult(parseBatchRow(batch)),
    });
  } catch (error) {
    console.error('[discovery] batch detail error:', error);
    next(error);
  }
});

/** POST /api/discovery/run */
router.post('/run', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (isDiscoveryRunning()) {
      return res.status(409).json({ ok: false, error: 'ALREADY_RUNNING' });
    }

    const runnable = await DiscoveryConfigService.isRunnable();
    if (!runnable.ok) {
      return res.status(409).json({
        ok: false,
        error: runnable.reason,
        reason: runnable.reason,
        ...(runnable.reason === 'DAILY_LIMIT_REACHED'
          ? { runsToday: runnable.runsToday, limit: runnable.limit, maxRunsPerDay: runnable.maxRunsPerDay }
          : {}),
        ...(runnable.reason === 'PAUSED' ? { until: runnable.until } : {}),
      });
    }

    const activeSeeds = await prisma.discoverySeedSource.count({
      where: {
        isActive: true,
        NOT: { value: '' },
      },
    });
    if (!activeSeeds) {
      return res.status(409).json({
        ok: false,
        error: 'NO_ACTIVE_SEEDS',
        message: 'Add a seed with a Value and turn Active on before running',
      });
    }

    const runId = cuid();

    setImmediate(() => {
      runAllActive('manual', req.userId)
        .then(async (batchSummaries) => {
          if (batchSummaries.length > 0) {
            await appendDiscoveryReport(batchSummaries);
          }
        })
        .catch((error) => {
          console.error('[discovery] Manual run failed:', error?.message || error);
        });
    });

    return res.status(202).json({ ok: true, runId, message: 'Batch started', activeSeeds });
  } catch (error) {
    console.error('[discovery] manual run error:', error);
    next(error);
  }
});

/** GET /api/discovery/stats */
router.get('/stats', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [stats, config, sourceRunsToday, limitRunsToday, runnable] = await Promise.all([
      UnclaimedStoreService.getDiscoveryStats(since),
      DiscoveryConfigService.getConfig(),
      // Display: every DiscoveryBatchRun row started today (one per seed execution).
      prisma.discoveryBatchRun.count({
        where: { startedAt: { gte: startOfDay } },
      }),
      // Quota: same filter as isRunnable / maxRunsPerDay enforcement.
      DiscoveryConfigService.countRunsToday(),
      DiscoveryConfigService.isRunnable(),
    ]);

    const nextRun = computeNextRun(config.cronExpression);
    const nextScheduledLabel = formatNextRunLabel(nextRun);

    let status = 'OFF';
    if (config.pausedUntil && new Date(config.pausedUntil) > new Date()) {
      status = 'PAUSED';
    } else if (config.enabled) {
      status = 'ACTIVE';
    }

    const schedulerStatus = runnable.ok ? 'active' : String(runnable.reason || 'disabled').toLowerCase();

    return res.status(200).json({
      ok: true,
      stats,
      ...stats,
      /** @deprecated Prefer sourceRunsToday — kept for older UI */
      runsToday: sourceRunsToday,
      sourceRunsToday,
      limitRunsToday,
      maxRunsPerDay: config.maxRunsPerDay,
      runsTodaySemantics: {
        sourceRunsTodayLabel: 'source batch rows started today (one row per seed per tick/Run Now)',
        limitRunsTodayLabel: 'completed+partial+running rows counted toward maxRunsPerDay',
        maxRunsPerDayLabel: 'max DiscoveryBatchRun rows (not scheduler ticks, not URL executions)',
      },
      nextRun,
      nextScheduledRun: nextRun,
      nextScheduledLabel,
      isCurrentlyRunning: isDiscoveryRunning(),
      schedulerStatus,
      status,
      runnable,
      pausedUntil: config.pausedUntil ?? null,
    });
  } catch (error) {
    console.error('[discovery] stats error:', error);
    next(error);
  }
});

/** POST /api/discovery/stores/:id/claim — start ownership verification */
router.post('/stores/:id/claim', requireAuth, async (req, res, next) => {
  try {
    const storeId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const method = typeof req.body?.method === 'string' ? req.body.method.trim() : '';
    const contact = typeof req.body?.contact === 'string' ? req.body.contact.trim() : '';

    if (!storeId || !method) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'method is required' });
    }

    const store = await UnclaimedStoreService.getForClaim(storeId);
    if (!store) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Store not found' });
    }
    if (store.status === 'claimed') {
      return res.status(409).json({ ok: false, error: 'already_claimed', message: 'This store has already been claimed' });
    }
    if (store.status !== 'unclaimed' && store.status !== 'claim_pending') {
      return res.status(409).json({ ok: false, error: 'invalid_state', message: `Store is ${store.status}` });
    }

    const methods = Array.isArray(store.claimAuthority?.methods) ? store.claimAuthority.methods : ['manual_review'];
    if (!methods.includes(method)) {
      return res.status(400).json({ ok: false, error: 'invalid_method', message: 'Claim method not available for this store' });
    }

    if (OTP_CLAIM_METHODS.has(method)) {
      if (!contact) {
        return res.status(400).json({ ok: false, error: 'contact_required', message: 'contact is required for OTP verification' });
      }
      const otp = generateOtp();
      setClaimOtp(storeId, req.user.id, otp);
      await UnclaimedStoreService.markClaimPending(storeId, req.user.id);
      return res.json({
        ok: true,
        requiresOtp: true,
        ...(process.env.NODE_ENV !== 'production' ? { otp } : {}),
      });
    }

    const draftStoreId = await resolveClaimDraftStoreId(store, req.user.id);
    await UnclaimedStoreService.completeClaim(storeId, req.user.id);
    clearClaimOtp(storeId);
    return res.json({ ok: true, requiresOtp: false, draftStoreId });
  } catch (error) {
    console.error('[discovery] stores claim error:', error);
    next(error);
  }
});

/** POST /api/discovery/stores/:id/claim/verify — complete OTP claim */
router.post('/stores/:id/claim/verify', requireAuth, async (req, res, next) => {
  try {
    const storeId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : String(req.body?.otp ?? '').trim();

    if (!storeId || !otp) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'otp is required' });
    }

    const store = await UnclaimedStoreService.getForClaim(storeId);
    if (!store) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Store not found' });
    }
    if (store.status === 'claimed') {
      return res.status(409).json({ ok: false, error: 'already_claimed', message: 'This store has already been claimed' });
    }

    const valid = verifyClaimOtp(storeId, req.user.id, otp);
    if (!valid) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_otp',
        message: 'Incorrect code, try again',
        expired: false,
      });
    }

    const draftStoreId = await resolveClaimDraftStoreId(store, req.user.id);
    await UnclaimedStoreService.completeClaim(storeId, req.user.id);
    return res.json({ ok: true, draftStoreId });
  } catch (error) {
    console.error('[discovery] stores claim verify error:', error);
    next(error);
  }
});

/** POST /api/discovery/stores/:id/claim/cancel — owner declines / cancels claim */
router.post('/stores/:id/claim/cancel', requireAuth, async (req, res, next) => {
  try {
    const storeId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'validation', message: 'id is required' });
    }

    clearClaimOtp(storeId);
    await UnclaimedStoreService.rejectClaim(storeId).catch(() => {});
    return res.json({ ok: true, storeId, status: 'unclaimed' });
  } catch (error) {
    console.error('[discovery] stores claim cancel error:', error);
    next(error);
  }
});

export default router;
