/**
 * Global Live × Cnet commercial contract (Batch A).
 * Public identity chain only — never put internal DB ids or device secrets in QR URLs.
 */

import { randomBytes } from 'node:crypto';

export const LIVE_CNET_ERROR_CODES = Object.freeze({
  LIVE_CNET_DISABLED: 'LIVE_CNET_DISABLED',
  LIVE_CNET_CAMPAIGN_NOT_FOUND: 'LIVE_CNET_CAMPAIGN_NOT_FOUND',
  LIVE_CNET_SESSION_NOT_FOUND: 'LIVE_CNET_SESSION_NOT_FOUND',
  LIVE_CNET_STORE_MISMATCH: 'LIVE_CNET_STORE_MISMATCH',
  LIVE_CNET_DEVICE_NOT_FOUND: 'LIVE_CNET_DEVICE_NOT_FOUND',
  LIVE_CNET_PLACEMENT_EXISTS: 'LIVE_CNET_PLACEMENT_EXISTS',
  LIVE_CNET_PLACEMENT_NOT_FOUND: 'LIVE_CNET_PLACEMENT_NOT_FOUND',
  LIVE_CNET_TOKEN_INVALID: 'LIVE_CNET_TOKEN_INVALID',
  LIVE_CNET_INVALID: 'LIVE_CNET_INVALID',
});

export const LIVE_CNET_CAMPAIGN_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
});

export const LIVE_CNET_EVENTS = Object.freeze({
  SCREEN_IMPRESSION: 'LIVE_CNET_SCREEN_IMPRESSION',
  QR_SCAN: 'LIVE_CNET_QR_SCAN',
  REGISTRATION: 'LIVE_CNET_REGISTRATION',
  ONLINE_JOIN: 'LIVE_CNET_ONLINE_JOIN',
  STORE_ACTION: 'LIVE_CNET_STORE_ACTION',
});

/** Never fold these into a single “viewers” number. */
export const LIVE_CNET_METRIC_KEYS = Object.freeze([
  'screenPlays',
  'qrScans',
  'registrations',
  'onlineJoins',
  'storeActions',
]);

export const LIVE_CNET_HEALTH = Object.freeze({
  ACTIVE_HLS: 'ACTIVE_HLS',
  ACTIVE_LIVE_CARD: 'ACTIVE_LIVE_CARD',
  STREAM_UNAVAILABLE: 'STREAM_UNAVAILABLE',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  SCHEDULE_PENDING: 'SCHEDULE_PENDING',
  SCHEDULE_EXPIRED: 'SCHEDULE_EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
  CAMPAIGN_PAUSED: 'CAMPAIGN_PAUSED',
  CAMPAIGN_DRAFT: 'CAMPAIGN_DRAFT',
});

export const LIVE_CNET_PLAYBACK_MODE = Object.freeze({
  HLS: 'hls',
  LIVE_CARD: 'live_card',
  NONE: 'none',
});

export const LIVE_CNET_PROPAGATION = Object.freeze({
  NEXT_PLAYLIST_FETCH: 'next_playlist_fetch',
  NOT_APPLICABLE: 'not_applicable',
});

/** Screen presence for live overlays — reuse Device Engine heartbeat timeout (3 minutes). */
export const LIVE_CNET_DEVICE_ONLINE_MS = 180 * 1000;

export function liveCnetError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

export function newPublicRef(prefix) {
  const p = String(prefix || 'gl').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'gl';
  return `${p}_${randomBytes(9).toString('base64url')}`;
}

export function isPublicRefSafe(value) {
  const s = String(value || '').trim();
  if (!s || s.length > 80) return false;
  if (!/^[a-z]{2,6}_[A-Za-z0-9_-]+$/.test(s)) return false;
  if (/^(cl|ck|cm)[a-z0-9]{20,}$/i.test(s)) return false;
  return true;
}

export function assertNoInternalIdsInDestination(url) {
  const raw = String(url || '');
  if (/[?&#/](deviceId|sessionId|storeId|playlistId)=/i.test(raw)) {
    throw liveCnetError(
      LIVE_CNET_ERROR_CODES.LIVE_CNET_INVALID,
      'Destination must not include internal identifiers',
      400,
    );
  }
}

export function placementInWindow(placement, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Date.now();
  if (placement?.withdrawnAt) return false;
  if (placement?.validFrom && new Date(placement.validFrom).getTime() > t) return false;
  if (placement?.validUntil && new Date(placement.validUntil).getTime() <= t) return false;
  return true;
}

export function campaignInWindow(campaign, now = new Date()) {
  if (!campaign || campaign.status !== LIVE_CNET_CAMPAIGN_STATUS.ACTIVE) return false;
  return placementInWindow(campaign, now);
}

export function buildHandoffPath(token) {
  return `/api/public/live-cnet/h/${encodeURIComponent(String(token || '').trim())}`;
}

export function buildStorefrontHandoffPath({ storeSlug, campaignPublicRef, placementPublicCode, devicePublicCode, attributionToken }) {
  const slug = encodeURIComponent(String(storeSlug || '').trim());
  const params = new URLSearchParams();
  if (campaignPublicRef) params.set('glc', campaignPublicRef);
  if (placementPublicCode) params.set('glp', placementPublicCode);
  if (devicePublicCode) params.set('gld', devicePublicCode);
  if (attributionToken) params.set('glt', attributionToken);
  const q = params.toString();
  return `/s/${slug}${q ? `?${q}` : ''}#live`;
}

export function emptyMetrics() {
  return {
    screenPlays: 0,
    qrScans: 0,
    registrations: 0,
    onlineJoins: 0,
    storeActions: 0,
    note: 'Counters are independent. Registrations are not viewers. Screen plays are not people.',
  };
}

export function metricsFromEventRows(rows) {
  const m = emptyMetrics();
  for (const row of rows || []) {
    const t = String(row.eventType || '');
    if (t === LIVE_CNET_EVENTS.SCREEN_IMPRESSION) m.screenPlays += 1;
    else if (t === LIVE_CNET_EVENTS.QR_SCAN) m.qrScans += 1;
    else if (t === LIVE_CNET_EVENTS.REGISTRATION) m.registrations += 1;
    else if (t === LIVE_CNET_EVENTS.ONLINE_JOIN) m.onlineJoins += 1;
    else if (t === LIVE_CNET_EVENTS.STORE_ACTION) m.storeActions += 1;
  }
  return m;
}

export function impressionDedupeKey({ devicePublicCode, campaignPublicRef, minuteBucket }) {
  return `imp:${campaignPublicRef}:${devicePublicCode}:${minuteBucket}`;
}

export function qrScanDedupeKey({ attributionToken, minuteBucket }) {
  return `qr:${attributionToken}:${minuteBucket}`;
}

export function eventIdempotencyDedupeKey({ eventType, attributionToken, idempotencyKey }) {
  const token = String(attributionToken || 'na');
  const idk = String(idempotencyKey || '').trim().slice(0, 80);
  if (!idk) return null;
  return `idk:${eventType}:${token}:${idk}`;
}

export function isDeviceOnline(lastSeenAt, now = new Date(), onlineMs = LIVE_CNET_DEVICE_ONLINE_MS) {
  if (!lastSeenAt) return false;
  const seen = lastSeenAt instanceof Date ? lastSeenAt.getTime() : Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return false;
  const t = now instanceof Date ? now.getTime() : Date.now();
  return t - seen <= onlineMs;
}

export function classifyPlaybackMode({ sessionState, hlsUrl, campaignStatus, placement, now = new Date() }) {
  if (placement?.withdrawnAt) {
    return { playbackMode: LIVE_CNET_PLAYBACK_MODE.NONE, health: LIVE_CNET_HEALTH.WITHDRAWN };
  }
  if (campaignStatus === LIVE_CNET_CAMPAIGN_STATUS.DRAFT) {
    return { playbackMode: LIVE_CNET_PLAYBACK_MODE.NONE, health: LIVE_CNET_HEALTH.CAMPAIGN_DRAFT };
  }
  if (campaignStatus === LIVE_CNET_CAMPAIGN_STATUS.PAUSED || campaignStatus === LIVE_CNET_CAMPAIGN_STATUS.ENDED) {
    return { playbackMode: LIVE_CNET_PLAYBACK_MODE.NONE, health: LIVE_CNET_HEALTH.CAMPAIGN_PAUSED };
  }
  const t = now instanceof Date ? now.getTime() : Date.now();
  if (placement?.validFrom && new Date(placement.validFrom).getTime() > t) {
    return { playbackMode: LIVE_CNET_PLAYBACK_MODE.NONE, health: LIVE_CNET_HEALTH.SCHEDULE_PENDING };
  }
  if (placement?.validUntil && new Date(placement.validUntil).getTime() <= t) {
    return { playbackMode: LIVE_CNET_PLAYBACK_MODE.NONE, health: LIVE_CNET_HEALTH.SCHEDULE_EXPIRED };
  }
  const live = String(sessionState || '').toUpperCase() === 'LIVE';
  if (live && hlsUrl) {
    return { playbackMode: LIVE_CNET_PLAYBACK_MODE.HLS, health: LIVE_CNET_HEALTH.ACTIVE_HLS };
  }
  if (live && !hlsUrl) {
    return { playbackMode: LIVE_CNET_PLAYBACK_MODE.LIVE_CARD, health: LIVE_CNET_HEALTH.STREAM_UNAVAILABLE };
  }
  return { playbackMode: LIVE_CNET_PLAYBACK_MODE.LIVE_CARD, health: LIVE_CNET_HEALTH.ACTIVE_LIVE_CARD };
}

export function applyDeviceOfflineHealth(health, online) {
  if (online) return health;
  if (
    health === LIVE_CNET_HEALTH.ACTIVE_HLS ||
    health === LIVE_CNET_HEALTH.ACTIVE_LIVE_CARD ||
    health === LIVE_CNET_HEALTH.STREAM_UNAVAILABLE
  ) {
    return LIVE_CNET_HEALTH.DEVICE_OFFLINE;
  }
  return health;
}

export function minuteBucket(now = new Date()) {
  return Math.floor((now instanceof Date ? now.getTime() : Date.now()) / 60000);
}
