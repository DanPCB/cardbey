/**
 * Batch B operator workflows: eligible devices, schedule, withdraw, preview, health.
 * Does not mutate Device/Playlist rows or session LIVE state.
 */

import { getPrismaClient } from '../prisma.js';
import { Features } from '../../config/features.js';
import { publicWebBase } from '../../utils/publicWebBase.js';
import { buildPublicPlaybackDto } from '../liveMarket/publicPlayback.js';
import {
  LIVE_CNET_ERROR_CODES,
  LIVE_CNET_HEALTH,
  LIVE_CNET_PLAYBACK_MODE,
  LIVE_CNET_PROPAGATION,
  applyDeviceOfflineHealth,
  assertNoInternalIdsInDestination,
  classifyPlaybackMode,
  isDeviceOnline,
  isPublicRefSafe,
  liveCnetError,
} from './domain.js';
import {
  getCampaign,
  getCampaignMetrics,
  loadStoreCampaign,
  toCampaignDto,
  toPlacementDto,
} from './service.js';

function client(prisma) {
  return prisma || getPrismaClient();
}

function requireContract() {
  if (!Features.liveMarket.cnetContractV1) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_DISABLED, 'Live Cnet contract is disabled', 403);
  }
}

function sessionHlsUrl(session) {
  const customerCode = String(process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '').trim() || null;
  const playback = buildPublicPlaybackDto(session, {
    playerEnabled: true,
    customerCode,
    providerConfirmedLive: String(session?.state) === 'LIVE',
  });
  return playback?.player?.hlsUrl || null;
}

export async function listCampaigns({ prisma, storeId, sessionId = null } = {}) {
  requireContract();
  const db = client(prisma);
  const where = { storeId: String(storeId) };
  if (sessionId) where.liveSessionId = String(sessionId);
  if (typeof db.globalLiveCnetCampaign?.findMany !== 'function') return [];
  const rows = await db.globalLiveCnetCampaign.findMany({
    where,
    include: { placements: true, liveSession: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => toCampaignDto(row));
}

export async function listEligibleDevices({ prisma, storeId, campaignPublicRef = null } = {}) {
  requireContract();
  const db = client(prisma);
  const devices = await db.device.findMany({
    where: { storeId: String(storeId) },
    select: {
      id: true,
      name: true,
      platform: true,
      status: true,
      lastSeenAt: true,
      location: true,
    },
    orderBy: { lastSeenAt: 'desc' },
  });
  let assigned = new Set();
  if (campaignPublicRef && isPublicRefSafe(campaignPublicRef)) {
    const campaign = await db.globalLiveCnetCampaign.findFirst({
      where: { publicRef: String(campaignPublicRef), storeId: String(storeId) },
      include: { placements: true },
    });
    assigned = new Set((campaign?.placements || []).map((p) => p.deviceId));
  }
  const now = new Date();
  return devices.map((d) => ({
    deviceId: d.id,
    displayName: d.name || d.platform || 'Screen',
    platform: d.platform || null,
    locationLabel: d.location || null,
    lastSeenAt: d.lastSeenAt || null,
    online: isDeviceOnline(d.lastSeenAt, now),
    eligible: true,
    alreadyAssigned: assigned.has(d.id),
  }));
}

export async function schedulePlacement({
  prisma,
  storeId,
  campaignPublicRef,
  placementPublicCode,
  validFrom = null,
  validUntil = null,
  locationLabel = undefined,
} = {}) {
  requireContract();
  const db = client(prisma);
  const campaign = await loadStoreCampaign(db, storeId, campaignPublicRef, true);
  const placement = (campaign.placements || []).find((p) => p.publicRef === String(placementPublicCode));
  if (!placement) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_PLACEMENT_NOT_FOUND, 'Placement not found', 404);
  }
  const data = {};
  if (validFrom !== undefined && validFrom !== null && validFrom !== '') data.validFrom = new Date(validFrom);
  if (validUntil !== undefined && validUntil !== null && validUntil !== '') data.validUntil = new Date(validUntil);
  if (validFrom === null) data.validFrom = null;
  if (validUntil === null) data.validUntil = null;
  if (locationLabel !== undefined) {
    data.locationLabel = locationLabel ? String(locationLabel).slice(0, 120) : null;
  }
  data.withdrawnAt = null;
  await db.globalLiveCnetPlacement.update({
    where: { id: placement.id },
    data,
  });
  return getCampaign({ prisma: db, storeId, publicRef: campaign.publicRef });
}

export async function withdrawPlacement({ prisma, storeId, campaignPublicRef, placementPublicCode } = {}) {
  requireContract();
  const db = client(prisma);
  const campaign = await loadStoreCampaign(db, storeId, campaignPublicRef, true);
  const placement = (campaign.placements || []).find((p) => p.publicRef === String(placementPublicCode));
  if (!placement) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_PLACEMENT_NOT_FOUND, 'Placement not found', 404);
  }
  await db.globalLiveCnetPlacement.update({
    where: { id: placement.id },
    data: { withdrawnAt: new Date() },
  });
  return getCampaign({ prisma: db, storeId, publicRef: campaign.publicRef });
}

function buildPreviewForPlacement(
  campaign,
  placement,
  deviceRow,
  now = new Date(),
  { includeDeviceHealth = true } = {},
) {
  const session = campaign.liveSession || {};
  const hlsUrl = sessionHlsUrl(session);
  const classified = classifyPlaybackMode({
    sessionState: session.state,
    hlsUrl,
    campaignStatus: campaign.status,
    placement,
    now,
  });
  const online = isDeviceOnline(deviceRow?.lastSeenAt, now);
  const health = includeDeviceHealth
    ? applyDeviceOfflineHealth(classified.health, online)
    : classified.health;
  const dto = toPlacementDto(placement, campaign);
  const liveCard = {
    overlayTitle: session.title || 'Global Live',
    overlayBadge:
      classified.playbackMode === LIVE_CNET_PLAYBACK_MODE.HLS
        ? 'LIVE NOW'
        : classified.health === LIVE_CNET_HEALTH.STREAM_UNAVAILABLE
          ? 'Live unavailable'
          : 'Live soon',
    overlayHint: 'Watch and shop on your phone',
    destinationUrl: dto.destinationUrl,
    storefrontPath: dto.storefrontPath,
  };
  assertNoInternalIdsInDestination(liveCard.destinationUrl);
  return {
    placementPublicCode: placement.publicRef,
    devicePublicCode: placement.devicePublicCode,
    deviceOnline: online,
    lastSeenAt: deviceRow?.lastSeenAt || null,
    playbackMode: classified.playbackMode,
    health,
    propagation:
      classified.playbackMode === LIVE_CNET_PLAYBACK_MODE.NONE
        ? LIVE_CNET_PROPAGATION.NOT_APPLICABLE
        : LIVE_CNET_PROPAGATION.NEXT_PLAYLIST_FETCH,
    liveCard,
    hlsUrl: classified.playbackMode === LIVE_CNET_PLAYBACK_MODE.HLS ? hlsUrl : null,
    sessionPublicState: String(session.state || ''),
    providerConfirmedLive: String(session.state || '') === 'LIVE',
  };
}

export async function previewCampaign({ prisma, storeId, publicRef } = {}) {
  requireContract();
  const db = client(prisma);
  const campaign = await loadStoreCampaign(db, storeId, publicRef, true);
  const deviceIds = (campaign.placements || []).map((p) => p.deviceId);
  const devices = deviceIds.length
    ? await db.device.findMany({
        where: { id: { in: deviceIds }, storeId: String(storeId) },
        select: { id: true, lastSeenAt: true, name: true },
      })
    : [];
  const byId = new Map(devices.map((d) => [d.id, d]));
  const now = new Date();
  return {
    campaign: toCampaignDto(campaign),
    placements: (campaign.placements || []).map((p) =>
      buildPreviewForPlacement(campaign, p, byId.get(p.deviceId), now),
    ),
    note: 'Preview only. Screens pick up overlays on the next playlist fetch. Counters stay separate.',
  };
}

export async function getCampaignHealth({ prisma, storeId, publicRef } = {}) {
  const preview = await previewCampaign({ prisma, storeId, publicRef });
  return {
    publicRef: preview.campaign.publicRef,
    status: preview.campaign.status,
    placements: preview.placements.map((p) => ({
      placementPublicCode: p.placementPublicCode,
      devicePublicCode: p.devicePublicCode,
      health: p.health,
      playbackMode: p.playbackMode,
      deviceOnline: p.deviceOnline,
      lastSeenAt: p.lastSeenAt,
      propagation: p.propagation,
    })),
    note: 'DEVICE_OFFLINE means no recent heartbeat. It is not a viewer count.',
  };
}

export async function getCampaignAnalytics({ prisma, storeId, publicRef } = {}) {
  requireContract();
  const metrics = await getCampaignMetrics({ prisma, storeId, publicRef });
  return {
    registrations: metrics.registrations,
    onlineViewers: metrics.onlineJoins,
    screenPlays: metrics.screenPlays,
    qrScans: metrics.qrScans,
    storeActions: metrics.storeActions,
    attributedEventCount: metrics.attributedEventCount || 0,
    unattributedEventCount: metrics.unattributedEventCount || 0,
    neverCombined: true,
    note: metrics.note,
  };
}

export async function projectPublicManifest({ prisma, token } = {}) {
  requireContract();
  if (!isPublicRefSafe(token)) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_TOKEN_INVALID, 'Invalid handoff', 404);
  }
  const db = client(prisma);
  const placement = await db.globalLiveCnetPlacement.findUnique({
    where: { attributionToken: String(token) },
    include: { campaign: { include: { liveSession: true } } },
  });
  if (!placement?.campaign) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_TOKEN_INVALID, 'Invalid handoff', 404);
  }
  const preview = buildPreviewForPlacement(
    placement.campaign,
    placement,
    { lastSeenAt: null },
    new Date(),
    { includeDeviceHealth: false },
  );
  const liveNow = preview.playbackMode === LIVE_CNET_PLAYBACK_MODE.HLS;
  const item = {
    id: `live-cnet-${placement.publicRef}`,
    type: liveNow ? 'live_hls' : preview.playbackMode === LIVE_CNET_PLAYBACK_MODE.LIVE_CARD ? 'live_card' : null,
    url: liveNow ? preview.hlsUrl : preview.liveCard.destinationUrl,
    qrValue: preview.liveCard.destinationUrl,
    overlayTitle: preview.liveCard.overlayTitle,
    overlayBadge: preview.liveCard.overlayBadge,
    overlayHint: preview.liveCard.overlayHint,
    campaignPublicRef: placement.campaign.publicRef,
    placementPublicCode: placement.publicRef,
    devicePublicCode: placement.devicePublicCode,
    playbackMode: preview.playbackMode,
    health: preview.health,
  };
  if (item.type) assertNoInternalIdsInDestination(item.qrValue);
  return {
    ok: true,
    item: item.type ? item : null,
    playbackMode: preview.playbackMode,
    health: preview.health,
  };
}
