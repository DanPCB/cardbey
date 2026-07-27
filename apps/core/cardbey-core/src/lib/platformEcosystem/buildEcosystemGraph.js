/**
 * Platform ecosystem graph — aggregate counts only (no PII).
 * Used by GET /api/admin/platform/ecosystem-graph
 */
import { listSeedRecords } from '../businessIngestion/IngestionRepository.js';

/** @typedef {'users'|'businesses'|'stores'|'claims'|'devices'|'missions'|'content'|'campaigns'|'revenue'|'discovery'|'verification'} EcosystemNodeType */

/**
 * @param {number | null | undefined} value
 */
function n(value) {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

/**
 * @param {number} count
 * @param {{ warningAt?: number; criticalAt?: number; idleWhenZero?: boolean }} thresholds
 * @returns {'healthy'|'warning'|'critical'|'idle'}
 */
function deriveStatus(count, thresholds = {}) {
  const { warningAt = 1, criticalAt = 10, idleWhenZero = true } = thresholds;
  if (count <= 0) return idleWhenZero ? 'idle' : 'healthy';
  if (count >= criticalAt) return 'critical';
  if (count >= warningAt) return 'warning';
  return 'healthy';
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function buildEcosystemGraph(prisma) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const seeds = await listSeedRecords().catch(() => []);

  const [
    totalUsers,
    totalBusinesses,
    publishedStores,
    activeStores,
    draftStores,
    totalDevices,
    offlineDevices,
    activeMissions,
    failedMissionsWeek,
    contentAssets,
    campaignsV1,
    campaignsV2,
    revenueEvents,
    pendingQa,
    claimable,
    verifiedClaims,
  ] = await Promise.all([
    prisma.user.count().catch(() => 0),
    prisma.business.count().catch(() => 0),
    prisma.business.count({ where: { publishedAt: { not: null } } }).catch(() => 0),
    prisma.business.count({ where: { isActive: true, publishedAt: { not: null } } }).catch(() => 0),
    prisma.draftStore.count({ where: { status: { in: ['draft', 'generating', 'ready', 'failed', 'committed'] } } }).catch(() => 0),
    prisma.device.count().catch(() => 0),
    prisma.device.count({ where: { status: 'offline' } }).catch(() => 0),
    prisma.missionRun.count({ where: { status: { in: ['running', 'queued', 'pending'] } } }).catch(() => 0),
    prisma.missionRun.count({ where: { status: 'failed', updatedAt: { gte: weekAgo } } }).catch(() => 0),
    prisma.contentLibraryAsset.count().catch(async () => {
      try {
        return await prisma.content.count();
      } catch {
        return 0;
      }
    }),
    prisma.campaign.count().catch(() => 0),
    prisma.campaignV2.count().catch(() => 0),
    prisma.promoRuleRedemption.count().catch(async () => {
      try {
        return await prisma.orchestratorRunReward.count();
      } catch {
        return 0;
      }
    }),
    Promise.resolve(seeds.filter((s) => s.verificationStatus === 'seeded_pending_qa').length),
    Promise.resolve(seeds.filter((s) => s.verificationStatus === 'seeded_claimable').length),
    Promise.resolve(
      seeds.filter(
        (s) => s.verificationStatus === 'verified_owner' || s.verificationStatus === 'active',
      ).length,
    ),
  ]);

  const discovered = Math.max(n(seeds.length), n(totalBusinesses));
  const storeCount = n(draftStores) + n(publishedStores);
  const campaignCount = n(campaignsV1) + n(campaignsV2);
  const claimCount = n(claimable) + n(pendingQa);
  const topRegion = (() => {
    const map = new Map();
    for (const s of seeds) {
      const region =
        s.normalized?.country ?? s.normalized?.city ?? s.normalized?.operatingRegion ?? null;
      if (!region) continue;
      const key = String(region).trim();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  })();

  /** @type {Array<{ id: string; type: EcosystemNodeType; label: string; status: string; region: string | null; count: number; route: string }>} */
  const nodes = [
    {
      id: 'discovery',
      type: 'discovery',
      label: 'Discovery',
      status: deriveStatus(n(pendingQa), { warningAt: 10, criticalAt: 50, idleWhenZero: false }),
      region: topRegion,
      count: discovered,
      route: '/admin/discovery',
    },
    {
      id: 'businesses',
      type: 'businesses',
      label: 'Businesses',
      status: discovered > 0 ? 'healthy' : 'idle',
      region: topRegion,
      count: discovered,
      route: '/marketing#business-network',
    },
    {
      id: 'claims',
      type: 'claims',
      label: 'Claims',
      status: deriveStatus(n(claimable), { warningAt: 1, criticalAt: 10 }),
      region: topRegion,
      count: claimCount,
      route: '/admin/discovery',
    },
    {
      id: 'verification',
      type: 'verification',
      label: 'Verification',
      status:
        n(claimable) > 0 && n(verifiedClaims) === 0
          ? 'critical'
          : deriveStatus(n(verifiedClaims), { warningAt: 0, criticalAt: 0, idleWhenZero: true }),
      region: topRegion,
      count: n(verifiedClaims),
      route: '/admin/discovery?view=claims',
    },
    {
      id: 'stores',
      type: 'stores',
      label: 'Stores',
      status: n(activeStores) > 0 ? 'healthy' : storeCount > 0 ? 'warning' : 'idle',
      region: topRegion,
      count: storeCount,
      route: '/marketing#store-network',
    },
    {
      id: 'performer',
      type: 'missions',
      label: 'Performer missions',
      status: n(failedMissionsWeek) >= 3 ? 'critical' : n(failedMissionsWeek) > 0 ? 'warning' : n(activeMissions) > 0 ? 'healthy' : 'idle',
      region: null,
      count: n(activeMissions),
      route: '/marketing#runtime',
    },
    {
      id: 'content',
      type: 'content',
      label: 'Content assets',
      status: n(contentAssets) > 0 ? 'healthy' : 'idle',
      region: null,
      count: n(contentAssets),
      route: '/marketing#store-network',
    },
    {
      id: 'campaigns',
      type: 'campaigns',
      label: 'Campaigns',
      status: n(campaignCount) > 0 ? 'healthy' : 'idle',
      region: null,
      count: n(campaignCount),
      route: '/promo',
    },
    {
      id: 'revenue',
      type: 'revenue',
      label: 'Revenue events',
      status: n(revenueEvents) > 0 ? 'healthy' : 'idle',
      region: null,
      count: n(revenueEvents),
      route: '/app/console/control-tower',
    },
    {
      id: 'users',
      type: 'users',
      label: 'Users',
      status: n(totalUsers) > 0 ? 'healthy' : 'idle',
      region: topRegion,
      count: n(totalUsers),
      route: '/marketing#user-network',
    },
    {
      id: 'devices',
      type: 'devices',
      label: 'Devices',
      status: n(offlineDevices) >= 3 ? 'critical' : n(offlineDevices) > 0 ? 'warning' : n(totalDevices) > 0 ? 'healthy' : 'idle',
      region: topRegion,
      count: n(totalDevices),
      route: '/marketing#device-network',
    },
  ];

  /** @type {Array<{ source: string; target: string; type: string; weight: number }>} */
  const edges = [
    { source: 'discovery', target: 'businesses', type: 'flow', weight: Math.max(discovered, 1) },
    { source: 'businesses', target: 'claims', type: 'flow', weight: Math.max(claimCount, 1) },
    { source: 'claims', target: 'verification', type: 'flow', weight: Math.max(n(verifiedClaims), 1) },
    { source: 'verification', target: 'stores', type: 'flow', weight: Math.max(storeCount, 1) },
    { source: 'stores', target: 'performer', type: 'flow', weight: Math.max(n(activeMissions), 1) },
    { source: 'performer', target: 'content', type: 'flow', weight: Math.max(n(contentAssets), 1) },
    { source: 'content', target: 'campaigns', type: 'flow', weight: Math.max(n(campaignCount), 1) },
    { source: 'campaigns', target: 'revenue', type: 'flow', weight: Math.max(n(revenueEvents), 1) },
    { source: 'devices', target: 'stores', type: 'deployment', weight: Math.max(n(totalDevices), 1) },
    { source: 'users', target: 'claims', type: 'ownership', weight: Math.max(n(claimable), 1) },
    { source: 'users', target: 'stores', type: 'ownership', weight: Math.max(n(activeStores), 1) },
  ];

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
  };
}
