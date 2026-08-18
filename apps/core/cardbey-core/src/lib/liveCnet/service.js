/**
 * Global Live × Cnet contract service.
 * Overlay is read-time only — never mutates stored playlists.
 */

import { getPrismaClient } from '../prisma.js';
import { Features } from '../../config/features.js';
import { publicWebBase } from '../../utils/publicWebBase.js';
import { buildPublicPlaybackDto } from '../liveMarket/publicPlayback.js';
import { STOREFRONT_PUBLICATION_STATUS } from '../liveMarket/domain.js';
import {
  LIVE_CNET_CAMPAIGN_STATUS,
  LIVE_CNET_ERROR_CODES,
  LIVE_CNET_EVENTS,
  assertNoInternalIdsInDestination,
  buildHandoffPath,
  buildStorefrontHandoffPath,
  campaignInWindow,
  classifyPlaybackMode,
  emptyMetrics,
  eventIdempotencyDedupeKey,
  impressionDedupeKey,
  isPublicRefSafe,
  liveCnetError,
  metricsFromEventRows,
  minuteBucket,
  newPublicRef,
  placementInWindow,
  qrScanDedupeKey,
} from './domain.js';

function client(prisma) {
  return prisma || getPrismaClient();
}

function requireContract() {
  if (!Features.liveMarket.cnetContractV1) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_DISABLED, 'Live Cnet contract is disabled', 403);
  }
}

export function toCampaignDto(row, extras = {}) {
  if (!row) return null;
  return {
    publicRef: row.publicRef,
    liveSessionPublicRef: row.liveSessionPublicRef,
    storePublicRef: row.storeSlug,
    storeId: extras.includeInternal ? row.storeId : undefined,
    liveSessionId: extras.includeInternal ? row.liveSessionId : undefined,
    status: row.status,
    creativeVersion: row.creativeVersion,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    placements: Array.isArray(row.placements)
      ? row.placements.map((p) => toPlacementDto(p, row, extras))
      : undefined,
  };
}

export function toPlacementDto(placement, campaign, extras = {}) {
  const destinationPath = buildStorefrontHandoffPath({
    storeSlug: campaign.storeSlug,
    campaignPublicRef: campaign.publicRef,
    placementPublicCode: placement.publicRef,
    devicePublicCode: placement.devicePublicCode,
    attributionToken: placement.attributionToken,
  });
  const origin = publicWebBase();
  const handoffPath = buildHandoffPath(placement.attributionToken);
  const destinationUrl = `${origin}${handoffPath}`;
  assertNoInternalIdsInDestination(destinationUrl);
  return {
    placementPublicCode: placement.publicRef,
    devicePublicCode: placement.devicePublicCode,
    locationLabel: placement.locationLabel || null,
    validFrom: placement.validFrom,
    validUntil: placement.validUntil,
    withdrawnAt: placement.withdrawnAt || null,
    creativeVersion: campaign.creativeVersion,
    destinationUrl,
    storefrontPath: destinationPath,
    deviceId: extras.includeInternal ? placement.deviceId : undefined,
  };
}

export async function createCampaign({ prisma, storeId, sessionId, hostUserId } = {}) {
  requireContract();
  const db = client(prisma);
  const session = await db.liveMarketSession.findFirst({
    where: { id: String(sessionId || ''), storeId: String(storeId || '') },
  });
  if (!session) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_SESSION_NOT_FOUND, 'Session not found', 404);
  }
  const store = await db.business.findUnique({
    where: { id: String(storeId) },
    select: { id: true, slug: true },
  });
  if (!store?.slug) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_STORE_MISMATCH, 'Store slug required', 409);
  }
  const existing = await db.globalLiveCnetCampaign.findUnique({
    where: { liveSessionId: session.id },
  });
  if (existing) {
    return toCampaignDto(await db.globalLiveCnetCampaign.findUnique({
      where: { id: existing.id },
      include: { placements: true },
    }));
  }
  const row = await db.globalLiveCnetCampaign.create({
    data: {
      publicRef: newPublicRef('glc'),
      liveSessionPublicRef: newPublicRef('gls'),
      liveSessionId: session.id,
      storeId: store.id,
      storeSlug: store.slug,
      status: LIVE_CNET_CAMPAIGN_STATUS.DRAFT,
    },
    include: { placements: true },
  });
  void hostUserId;
  return toCampaignDto(row);
}

export async function activateCampaign({ prisma, storeId, publicRef } = {}) {
  requireContract();
  const db = client(prisma);
  const row = await loadStoreCampaign(db, storeId, publicRef);
  const updated = await db.globalLiveCnetCampaign.update({
    where: { id: row.id },
    data: { status: LIVE_CNET_CAMPAIGN_STATUS.ACTIVE },
    include: { placements: true },
  });
  return toCampaignDto(updated);
}

export async function pauseCampaign({ prisma, storeId, publicRef } = {}) {
  requireContract();
  const db = client(prisma);
  const row = await loadStoreCampaign(db, storeId, publicRef);
  const updated = await db.globalLiveCnetCampaign.update({
    where: { id: row.id },
    data: { status: LIVE_CNET_CAMPAIGN_STATUS.PAUSED },
    include: { placements: true },
  });
  return toCampaignDto(updated);
}

export async function assignPlacement({
  prisma,
  storeId,
  campaignPublicRef,
  deviceId,
  locationLabel,
  validFrom,
  validUntil,
} = {}) {
  requireContract();
  const db = client(prisma);
  const campaign = await loadStoreCampaign(db, storeId, campaignPublicRef);
  const device = await db.device.findFirst({
    where: { id: String(deviceId || ''), storeId: String(storeId) },
    select: { id: true, pairingCode: true },
  });
  if (!device) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_DEVICE_NOT_FOUND, 'Device not found for store', 404);
  }
  const dup = await db.globalLiveCnetPlacement.findFirst({
    where: { campaignId: campaign.id, deviceId: device.id },
  });
  if (dup) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_PLACEMENT_EXISTS, 'Device already assigned', 409);
  }
  const placement = await db.globalLiveCnetPlacement.create({
    data: {
      publicRef: newPublicRef('glp'),
      campaignId: campaign.id,
      deviceId: device.id,
      devicePublicCode: newPublicRef('gld'),
      locationLabel: locationLabel ? String(locationLabel).slice(0, 120) : null,
      attributionToken: newPublicRef('glt'),
      validFrom: validFrom ? new Date(validFrom) : campaign.validFrom,
      validUntil: validUntil ? new Date(validUntil) : campaign.validUntil,
    },
  });
  const fresh = await db.globalLiveCnetCampaign.findUnique({
    where: { id: campaign.id },
    include: { placements: true },
  });
  void placement;
  return toCampaignDto(fresh);
}

export async function getCampaign({ prisma, storeId, publicRef } = {}) {
  requireContract();
  const db = client(prisma);
  const row = await loadStoreCampaign(db, storeId, publicRef, true);
  return toCampaignDto(row);
}

export async function getCampaignMetrics({ prisma, storeId, publicRef } = {}) {
  requireContract();
  const db = client(prisma);
  const row = await loadStoreCampaign(db, storeId, publicRef);
  if (typeof db.globalLiveCnetEvent?.findMany !== 'function') return emptyMetrics();
  const events = await db.globalLiveCnetEvent.findMany({
    where: { campaignId: row.id },
    select: { eventType: true, attributionToken: true },
  });
  const metrics = metricsFromEventRows(events);
  const withToken = events.filter((e) => e.attributionToken);
  return {
    ...metrics,
    attributedEventCount: withToken.length,
    unattributedEventCount: events.length - withToken.length,
    neverCombined: true,
  };
}

export async function loadStoreCampaign(db, storeId, publicRef, withPlacements = false) {
  if (!isPublicRefSafe(publicRef)) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_CAMPAIGN_NOT_FOUND, 'Unknown campaign', 404);
  }
  const row = await db.globalLiveCnetCampaign.findFirst({
    where: { publicRef: String(publicRef), storeId: String(storeId) },
    include: withPlacements ? { placements: true, liveSession: true } : { liveSession: true },
  });
  if (!row) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_CAMPAIGN_NOT_FOUND, 'Campaign not found', 404);
  }
  return row;
}

export async function recordContractEvent({
  prisma,
  eventType,
  attributionToken,
  campaignPublicRef,
  extraDedupe = '',
  idempotencyKey = '',
} = {}) {
  if (!Features.liveMarket.cnetContractV1) return { recorded: false };
  const allowed = Object.values(LIVE_CNET_EVENTS);
  if (!allowed.includes(String(eventType))) return { recorded: false };
  const db = client(prisma);
  if (typeof db.globalLiveCnetPlacement?.findUnique !== 'function') return { recorded: false };

  let placement = null;
  let campaign = null;
  if (attributionToken && isPublicRefSafe(attributionToken)) {
    placement = await db.globalLiveCnetPlacement.findUnique({
      where: { attributionToken: String(attributionToken) },
      include: { campaign: { include: { liveSession: true } } },
    });
    campaign = placement?.campaign || null;
  } else if (campaignPublicRef && isPublicRefSafe(campaignPublicRef)) {
    campaign = await db.globalLiveCnetCampaign.findUnique({
      where: { publicRef: String(campaignPublicRef) },
      include: { liveSession: true, placements: true },
    });
  }
  if (!campaign) return { recorded: false };

  const idempotent = eventIdempotencyDedupeKey({
    eventType,
    attributionToken: placement?.attributionToken || attributionToken,
    idempotencyKey,
  });
  const dedupeKey =
    idempotent ||
    extraDedupe ||
    `${eventType}:${campaign.publicRef}:${placement?.publicRef || 'na'}:${Date.now()}`;

  try {
    await db.globalLiveCnetEvent.create({
      data: {
        eventType: String(eventType),
        campaignId: campaign.id,
        placementId: placement?.id || null,
        campaignPublicRef: campaign.publicRef,
        liveSessionPublicRef: campaign.liveSessionPublicRef,
        storePublicRef: campaign.storeSlug,
        devicePublicCode: placement?.devicePublicCode || null,
        placementPublicCode: placement?.publicRef || null,
        attributionToken: placement?.attributionToken || null,
        creativeVersion: campaign.creativeVersion,
        dedupeKey: String(dedupeKey).slice(0, 190),
      },
    });
    return { recorded: true };
  } catch (err) {
    if (String(err?.code) === 'P2002') return { recorded: false, duplicate: true };
    return { recorded: false };
  }
}

export async function consumeHandoffToken({ prisma, token } = {}) {
  requireContract();
  if (!isPublicRefSafe(token)) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_TOKEN_INVALID, 'Invalid handoff', 404);
  }
  const db = client(prisma);
  const placement = await db.globalLiveCnetPlacement.findUnique({
    where: { attributionToken: String(token) },
    include: { campaign: true },
  });
  if (!placement?.campaign || placement.campaign.status !== LIVE_CNET_CAMPAIGN_STATUS.ACTIVE) {
    throw liveCnetError(LIVE_CNET_ERROR_CODES.LIVE_CNET_TOKEN_INVALID, 'Invalid handoff', 404);
  }
  await recordContractEvent({
    prisma: db,
    eventType: LIVE_CNET_EVENTS.QR_SCAN,
    attributionToken: token,
    extraDedupe: qrScanDedupeKey({
      attributionToken: token,
      minuteBucket: minuteBucket(),
    }),
  });
  const path = buildStorefrontHandoffPath({
    storeSlug: placement.campaign.storeSlug,
    campaignPublicRef: placement.campaign.publicRef,
    placementPublicCode: placement.publicRef,
    devicePublicCode: placement.devicePublicCode,
    attributionToken: placement.attributionToken,
  });
  return { location: `${publicWebBase()}${path}` };
}

/**
 * Read-time overlay for Device V2 playlist/full.
 * Additive items only; never mutates Playlist rows.
 */
export async function resolveDeviceLiveOverlay({ prisma, deviceId, now = new Date() } = {}) {
  if (!Features.liveMarket.cnetContractV1) return null;
  if (!deviceId) return null;
  const db = client(prisma);
  if (typeof db.globalLiveCnetPlacement?.findMany !== 'function') return null;
  const placements = await db.globalLiveCnetPlacement.findMany({
    where: { deviceId: String(deviceId) },
    include: { campaign: { include: { liveSession: true } } },
  });
  const active = placements.find(
    (p) => campaignInWindow(p.campaign, now) && placementInWindow(p, now),
  );
  if (!active?.campaign?.liveSession) return null;

  const session = active.campaign.liveSession;
  const published =
    String(session.storefrontPublicationStatus) === STOREFRONT_PUBLICATION_STATUS.PUBLISHED;
  if (!published && String(session.state) !== 'LIVE') return null;

  const customerCode = String(process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '').trim() || null;
  const playback = buildPublicPlaybackDto(session, {
    playerEnabled: true,
    customerCode,
    providerConfirmedLive: String(session.state) === 'LIVE',
  });
  const hlsUrl = playback?.player?.hlsUrl || null;
  const classified = classifyPlaybackMode({
    sessionState: session.state,
    hlsUrl,
    campaignStatus: active.campaign.status,
    placement: active,
  });
  if (classified.playbackMode === 'none') return null;

  const liveNow = classified.playbackMode === 'hls';
  const destinationUrl = `${publicWebBase()}${buildHandoffPath(active.attributionToken)}`;
  assertNoInternalIdsInDestination(destinationUrl);

  return {
    item: {
      id: `live-cnet-${active.publicRef}`,
      type: liveNow ? 'live_hls' : 'live_card',
      url: liveNow ? hlsUrl : destinationUrl,
      mimeType: liveNow ? 'application/vnd.apple.mpegurl' : 'text/html',
      durationMs: liveNow ? 4 * 60 * 60 * 1000 : 15000,
      order: -1,
      muted: true,
      qrValue: destinationUrl,
      overlayTitle: session.title,
      overlayBadge: liveNow ? 'LIVE NOW' : classified.health === 'STREAM_UNAVAILABLE' ? 'Live unavailable' : 'Live soon',
      overlayHint: 'Watch and shop on your phone',
      campaignPublicRef: active.campaign.publicRef,
      placementPublicCode: active.publicRef,
      devicePublicCode: active.devicePublicCode,
      liveSessionPublicRef: active.campaign.liveSessionPublicRef,
      storePublicRef: active.campaign.storeSlug,
      creativeVersion: active.campaign.creativeVersion,
      playbackMode: classified.playbackMode,
      health: classified.health,
    },
    placement: active,
    playbackMode: classified.playbackMode,
    health: classified.health,
  };
}

export async function prependLiveCnetOverlayItems({ prisma, deviceId, items = [] } = {}) {
  try {
    const overlay = await resolveDeviceLiveOverlay({ prisma, deviceId });
    if (!overlay?.item) return items;
    await recordContractEvent({
      prisma,
      eventType: LIVE_CNET_EVENTS.SCREEN_IMPRESSION,
      attributionToken: overlay.placement.attributionToken,
      extraDedupe: impressionDedupeKey({
        devicePublicCode: overlay.placement.devicePublicCode,
        campaignPublicRef: overlay.placement.campaign.publicRef,
        minuteBucket: minuteBucket(),
      }),
    });
    return [overlay.item, ...items];
  } catch {
    return items;
  }
}
