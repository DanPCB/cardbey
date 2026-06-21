/**
 * Cardbey Control Center — platform-level admin metrics (no per-store BI).
 * GET /api/admin/platform/store-network
 * GET /api/admin/platform/device-network
 * GET /api/admin/platform/account-network
 * GET /api/admin/platform/region-overview
 * GET /api/admin/platform/ecosystem-graph
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { getPrismaClient } from '../../lib/prisma.js';
import {
  EXECUTION_STATES,
  isRealExecution,
  isSloSuccessState,
} from '../../lib/telemetry/executionStates.js';
import { listSeedRecords } from '../../lib/businessIngestion/IngestionRepository.js';
import { buildEcosystemGraph } from '../../lib/platformEcosystem/buildEcosystemGraph.js';
import checkCnetConfig from '../../lib/toolExecutors/cnet/check_cnet_config.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function pctRate(numerator, denominator) {
  const d = Number(denominator) || 0;
  const n = Number(numerator) || 0;
  if (d < 1) return null;
  return Math.round((n / d) * 1000) / 1000;
}

function startOfDayOffset(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @param {string | null | undefined} country */
export function normalizeRegion(country) {
  if (!country || !String(country).trim()) return 'Unknown';
  const c = String(country).trim().toLowerCase();
  if (c === 'au' || c.includes('australia')) return 'Australia';
  if (c === 'vn' || c.includes('vietnam') || c.includes('việt')) return 'Vietnam';
  if (c === 'sg' || c.includes('singapore')) return 'Singapore';
  return String(country).trim();
}

router.get('/platform/store-network', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const today = startOfToday();

    const draftStatuses = ['draft', 'generating', 'ready', 'failed'];
    const [
      totalDraftStores,
      publishedStores,
      activeStores,
      archivedStores,
      createdTodayDrafts,
      createdTodayBusinesses,
      publishedToday,
      awaitingReview,
      committedDrafts,
      readyOrCommitted,
    ] = await Promise.all([
      prisma.draftStore.count({
        where: { status: { in: draftStatuses } },
      }),
      prisma.business.count({ where: { publishedAt: { not: null } } }),
      prisma.business.count({ where: { isActive: true, publishedAt: { not: null } } }),
      prisma.business.count({ where: { isActive: false } }),
      prisma.draftStore.count({ where: { createdAt: { gte: today } } }),
      prisma.business.count({ where: { createdAt: { gte: today } } }),
      prisma.business.count({ where: { publishedAt: { gte: today } } }),
      prisma.draftStore.count({ where: { status: 'ready' } }),
      prisma.draftStore.count({ where: { status: 'committed' } }),
      prisma.draftStore.count({ where: { status: { in: ['ready', 'committed'] } } }),
    ]);

    const createdToday = createdTodayDrafts + createdTodayBusinesses;
    const publishConversionRate = pctRate(committedDrafts, readyOrCommitted);

    res.json({
      ok: true,
      totalDraftStores,
      publishedStores,
      activeStores,
      archivedStores,
      createdToday,
      publishedToday,
      awaitingReview,
      publishConversionRate,
    });
  } catch (e) {
    console.error('[admin/platform/store-network]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'store_network_failed' });
  }
});

router.get('/platform/device-network', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const weekAgo = startOfWeek();

    const [pairRequests, playlistFailures, heartbeatErrors, lastHeartbeatRow, devices, cnet] =
      await Promise.all([
        prisma.devicePairing.count({ where: { status: 'pending' } }),
        prisma.devicePlaylistBinding.count({ where: { status: 'failed' } }),
        prisma.deviceAlert.count({
          where: {
            type: { in: ['connection_lost', 'heartbeat_error', 'heartbeat_timeout'] },
            createdAt: { gte: weekAgo },
          },
        }),
        prisma.device.findFirst({
          where: { lastSeenAt: { not: null } },
          orderBy: { lastSeenAt: 'desc' },
          select: { lastSeenAt: true },
        }),
        prisma.device.findMany({
          select: { status: true, location: true, type: true, platform: true },
        }),
        checkCnetConfig().catch(() => null),
      ]);

    let tvDevices = 0;
    let mobileDevices = 0;
    let onlineDevices = 0;
    let offlineDevices = 0;
    const regionMap = new Map();

    for (const d of devices) {
      const p = String(d.platform ?? '').toLowerCase();
      const t = String(d.type ?? '').toLowerCase();
      if (t === 'screen' || p.includes('tv') || p.includes('android_tv')) tvDevices += 1;
      if (p.includes('pwa') || p.includes('mobile') || p.includes('browser')) mobileDevices += 1;
      if (d.status === 'online') onlineDevices += 1;
      if (d.status === 'offline') offlineDevices += 1;

      const region = normalizeRegion(d.location);
      const row = regionMap.get(region) ?? { region, total: 0, online: 0 };
      row.total += 1;
      if (d.status === 'online') row.online += 1;
      regionMap.set(region, row);
    }

    const totalDevices = devices.length;
    const byRegion = [...regionMap.values()].sort((a, b) => b.total - a.total);
    const cnetStatus = cnet?.output?.configured === true ? 'healthy' : 'degraded';

    res.json({
      ok: true,
      totalDevices,
      onlineDevices,
      offlineDevices,
      tvDevices,
      mobileDevices,
      pairRequests,
      playlistFailures,
      heartbeatErrors,
      lastHeartbeatAt: lastHeartbeatRow?.lastSeenAt?.toISOString?.() ?? null,
      byRegion,
      cnetStatus,
    });
  } catch (e) {
    console.error('[admin/platform/device-network]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'device_network_failed' });
  }
});

router.get('/platform/runtime-metrics', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = startOfDayOffset(7);

    const [activeMissions, queuedMissions, failedMissions, obsTotal24h, obsRows24h] =
      await Promise.all([
        prisma.missionPipeline.count({
          where: { status: { in: ['running', 'queued', 'awaiting_input'] } },
        }),
        prisma.missionPipeline.count({ where: { status: 'queued' } }),
        prisma.missionPipeline.count({ where: { status: 'failed' } }),
        prisma.observation.count({ where: { createdAt: { gte: since24h } } }),
        prisma.observation.findMany({
          where: { createdAt: { gte: since24h } },
          select: {
            outcome: true,
            executionState: true,
            isRealExecution: true,
            actionType: true,
            error: true,
          },
          take: 5000,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const realRows = obsRows24h.filter(
      (row) => row.isRealExecution !== false && isRealExecution(row.executionState),
    );
    const stubRows = obsRows24h.filter((row) => row.executionState === EXECUTION_STATES.STUBBED);
    const blockedRows24h = obsRows24h.filter((row) => row.executionState === EXECUTION_STATES.BLOCKED);
    const plannedRows24h = obsRows24h.filter((row) => row.executionState === EXECUTION_STATES.PLANNED);
    const realSuccess24h = realRows.filter(
      (row) => row.outcome === 'success' && isSloSuccessState(row.executionState),
    ).length;
    const stubSuccess24h = stubRows.filter((row) => row.outcome === 'success').length;

    const realSuccessRatePct =
      realRows.length > 0 ? Math.round((realSuccess24h / realRows.length) * 100) : 100;
    const stubSuccessRatePct =
      stubRows.length > 0 ? Math.round((stubSuccess24h / stubRows.length) * 100) : 0;
    const successRatePct = realSuccessRatePct;

    const failureRows = await prisma.observation.findMany({
      where: { outcome: 'failure', createdAt: { gte: since7d } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        actionType: true,
        error: true,
        executionState: true,
        isRealExecution: true,
      },
    });

    /** @type {Map<string, { count: number; errors: string[] }>} */
    const realFailureMap = new Map();
    /** @type {Map<string, { count: number; errors: string[] }>} */
    const stubFailureMap = new Map();
    for (const row of failureRows) {
      const action = String(row.actionType || 'unknown');
      const isStub =
        row.executionState === EXECUTION_STATES.STUBBED ||
        row.isRealExecution === false ||
        !isRealExecution(row.executionState);
      const map = isStub ? stubFailureMap : realFailureMap;
      const current = map.get(action) ?? { count: 0, errors: [] };
      current.count += 1;
      if (row.error && current.errors.length < 5) current.errors.push(String(row.error));
      map.set(action, current);
    }

    const mapToPatterns = (map) =>
      [...map.entries()]
        .map(([action, data]) => ({ action, count: data.count, errors: data.errors }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const failurePatterns = mapToPatterns(realFailureMap);
    const stubFailurePatterns = mapToPatterns(stubFailureMap);
    const realFailures = failureRows.filter(
      (row) =>
        row.isRealExecution !== false &&
        isRealExecution(row.executionState) &&
        row.outcome === 'failure',
    ).length;
    const stubFailures = failureRows.filter(
      (row) =>
        row.executionState === EXECUTION_STATES.STUBBED ||
        row.isRealExecution === false ||
        !isRealExecution(row.executionState),
    ).length;

    res.json({
      ok: true,
      activeMissions,
      queuedMissions,
      failedMissions,
      successRatePct,
      realSuccessRatePct,
      stubSuccessRatePct,
      realFailures,
      stubFailures,
      observationCount24h: obsTotal24h,
      realExecutions24h: realRows.length,
      stubExecutions24h: stubRows.length,
      blockedExecutions24h: blockedRows24h.length,
      plannedExecutions24h: plannedRows24h.length,
      failurePatterns,
      stubFailurePatterns,
      window: { since24h: since24h.toISOString(), since7d: since7d.toISOString() },
    });
  } catch (e) {
    console.error('[admin/platform/runtime-metrics]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'runtime_metrics_failed' });
  }
});

router.get('/platform/learning-metrics', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const weights = await prisma.patternWeight.findMany({
      where: { patternId: { startsWith: 'obs:' } },
      orderBy: { weight: 'desc' },
      take: 50,
      select: {
        patternId: true,
        intent: true,
        matchedSkill: true,
        weight: true,
        lastAdjusted: true,
      },
    });

    const capabilitySuccessRates = weights.map((w) => ({
      capability: w.matchedSkill,
      intent: w.intent,
      successRatePct: Math.round((Number(w.weight) || 0) * 1000) / 10,
      lastAdjustedAt: w.lastAdjusted?.toISOString?.() ?? null,
    }));

    res.json({
      ok: true,
      totalPatterns: weights.length,
      capabilitySuccessRates,
    });
  } catch (e) {
    console.error('[admin/platform/learning-metrics]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'learning_metrics_failed' });
  }
});

router.get('/platform/account-network', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const today = startOfToday();
    const weekAgo = startOfWeek();

    const [
      totalAccounts,
      verifiedAccounts,
      pendingVerification,
      businessAccounts,
      consumerAccounts,
      newToday,
      newThisWeek,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { emailVerified: false } }),
      prisma.user.count({
        where: {
          OR: [{ hasBusiness: true }, { accountType: { in: ['business', 'both'] } }],
        },
      }),
      prisma.user.count({
        where: {
          OR: [{ accountType: 'personal' }, { accountType: null }],
          hasBusiness: false,
        },
      }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);

    res.json({
      ok: true,
      totalAccounts,
      verifiedAccounts,
      pendingVerification,
      businessAccounts,
      consumerAccounts,
      suspendedAccounts: null,
      disabledAccounts: null,
      newToday,
      newThisWeek,
    });
  } catch (e) {
    console.error('[admin/platform/account-network]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'account_network_failed' });
  }
});

router.get('/platform/region-overview', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const seeds = await listSeedRecords().catch(() => []);

    const [businesses, users, devices] = await Promise.all([
      prisma.business.findMany({ select: { country: true, region: true, isActive: true } }),
      prisma.user.findMany({ select: { country: true } }),
      prisma.device.findMany({ select: { location: true, status: true } }),
    ]);

    const map = new Map();

    const ensure = (region) => {
      const key = normalizeRegion(region);
      if (!map.has(key)) {
        map.set(key, { region: key, businesses: 0, users: 0, devices: 0, claims: 0 });
      }
      return map.get(key);
    };

    for (const b of businesses) {
      const row = ensure(b.country ?? b.region);
      row.businesses += 1;
    }

    for (const u of users) {
      const row = ensure(u.country);
      row.users += 1;
    }

    for (const d of devices) {
      const row = ensure(d.location);
      row.devices += 1;
    }

    for (const seed of seeds) {
      const country =
        seed.normalized?.country ??
        seed.normalized?.city ??
        seed.normalized?.operatingRegion ??
        null;
      const row = ensure(country);
      if (
        seed.verificationStatus === 'verified_owner' ||
        seed.verificationStatus === 'active' ||
        seed.verificationStatus === 'seeded_claimable'
      ) {
        row.claims += 1;
      }
    }

    const regions = [...map.values()].sort((a, b) => {
      const sumA = a.businesses + a.users + a.devices;
      const sumB = b.businesses + b.users + b.devices;
      return sumB - sumA;
    });

    res.json({ ok: true, regions });
  } catch (e) {
    console.error('[admin/platform/region-overview]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'region_overview_failed' });
  }
});

router.get('/platform/ecosystem-graph', async (req, res) => {
  try {
    const prisma = getPrismaClient();
    const graph = await buildEcosystemGraph(prisma);
    res.json({ ok: true, ...graph });
  } catch (e) {
    console.error('[admin/platform/ecosystem-graph]', e);
    res.status(500).json({ ok: false, error: e?.message ?? 'ecosystem_graph_failed' });
  }
});

export default router;
