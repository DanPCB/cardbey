/** Canonical store engagement event types (StoreActivityEvent.eventType). */
export const STORE_ENGAGEMENT_EVENT_TYPES = new Set([
  'STORE_VIEWED',
  'STORE_FOLLOWED',
  'STORE_UNFOLLOWED',
  'STORE_LIKED',
  'STORE_UNLIKED',
  'STORE_SAVED',
  'STORE_UNSAVED',
  'STORE_SHARED',
  'QR_SCANNED',
  'ORDER_CLICKED',
  'CALL_CLICKED',
  'MESSAGE_CLICKED',
  'WEBSITE_CLICKED',
  'MAP_CLICKED',
  'OFFER_VIEWED',
  'OFFER_CLAIMED',
  'STORE_REVIEWED',
  'STORE_RATED',
  'VIDEO_PLAYED',
  'LIVE_JOINED',
  'CAMPAIGN_OPENED',
  'CAMPAIGN_CLICKED',
]);

/** Snapshot field deltas per event type (+1 / -1). */
export const EVENT_SNAPSHOT_DELTA = {
  STORE_VIEWED: { viewsCount: 1, views24h: 1, views7d: 1 },
  STORE_FOLLOWED: { followersCount: 1 },
  STORE_UNFOLLOWED: { followersCount: -1 },
  STORE_LIKED: { likesCount: 1 },
  STORE_UNLIKED: { likesCount: -1 },
  STORE_SAVED: { savesCount: 1 },
  STORE_UNSAVED: { savesCount: -1 },
  STORE_SHARED: { sharesCount: 1 },
  QR_SCANNED: { qrScansCount: 1 },
  ORDER_CLICKED: { orderClicksCount: 1 },
  CALL_CLICKED: { callClicksCount: 1 },
  OFFER_CLAIMED: { offerClaimsCount: 1 },
};

export const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/**
 * engagementScore =
 *   views7d×1 + likes×5 + saves×8 + shares×10 + followers×12 + orderClicks×15 + offerClaims×20
 * @param {object} snap
 */
export function computeEngagementScore(snap) {
  return (
    (snap.views7d ?? 0) * 1 +
    (snap.likesCount ?? 0) * 5 +
    (snap.savesCount ?? 0) * 8 +
    (snap.sharesCount ?? 0) * 10 +
    (snap.followersCount ?? 0) * 12 +
    (snap.orderClicksCount ?? 0) * 15 +
    (snap.offerClaimsCount ?? 0) * 20
  );
}

/** @param {string} eventType */
export function snapshotFieldForEvent(eventType) {
  const delta = EVENT_SNAPSHOT_DELTA[eventType];
  if (!delta) return null;
  const [field] = Object.keys(delta);
  return field ?? null;
}
