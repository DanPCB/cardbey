/**
 * Store engagement SSE — public-feed, store:{id}, owner-store:{id} channels.
 * Reuses simpleSse broadcast infrastructure.
 */

import { broadcastSse } from '../../realtime/simpleSse.js';

const PUBLIC_FEED_KEY = 'public-feed';

/**
 * @param {string} storeId
 */
export function storeChannelKey(storeId) {
  return `store:${String(storeId ?? '').trim()}`;
}

/**
 * @param {string} storeId
 */
export function ownerStoreChannelKey(storeId) {
  return `owner-store:${String(storeId ?? '').trim()}`;
}

/**
 * @param {string} userId
 */
export function userChannelKey(userId) {
  return `user:${String(userId ?? '').trim()}`;
}

/**
 * Broadcast engagement count update to public + store channels.
 * @param {object} input
 */
export function publishEngagementUpdated(input) {
  const { storeId, snapshot, changedField, delta } = input;
  if (!storeId || !snapshot) return;

  const payload = {
    type: 'STORE_ENGAGEMENT_UPDATED',
    storeId,
    counts: {
      followers: snapshot.followersCount ?? 0,
      likes: snapshot.likesCount ?? 0,
      saves: snapshot.savesCount ?? 0,
      shares: snapshot.sharesCount ?? 0,
      views7d: snapshot.views7d ?? 0,
      engagementScore: snapshot.engagementScore ?? 0,
    },
    changed: changedField
      ? { field: changedField, delta: delta ?? 0 }
      : undefined,
  };

  broadcastSse(PUBLIC_FEED_KEY, 'STORE_ENGAGEMENT_UPDATED', payload);
  broadcastSse(storeChannelKey(storeId), 'STORE_ENGAGEMENT_UPDATED', payload);
}

/**
 * Owner-only activity event payload.
 * @param {object} input
 */
export function publishOwnerActivityEvent(input) {
  const { storeId, event } = input;
  if (!storeId || !event) return;

  const payload = {
    type: 'STORE_ACTIVITY_EVENT',
    activityType: event.eventType,
    source: event.source,
    metadata: event.metadataJson ?? {},
    timestamp: event.createdAt,
  };

  broadcastSse(ownerStoreChannelKey(storeId), 'STORE_ACTIVITY_EVENT', payload);
}
