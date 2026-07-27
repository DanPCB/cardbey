/** @typedef {import('../platformActivity/platformActivityTypes.js').PlatformActivitySeverity} PlatformActivitySeverity */

/**
 * @typedef {Object} StoreActivityEvent
 * @property {string} id
 * @property {string} storeId
 * @property {string} type
 * @property {string} category
 * @property {PlatformActivitySeverity} severity
 * @property {'user' | 'system' | 'admin' | 'device' | 'performer'} actorType
 * @property {string | null} actorId
 * @property {string | null} entityType
 * @property {string | null} entityId
 * @property {string} title
 * @property {string} message
 * @property {string | null} route
 * @property {string | null} actionLabel
 * @property {string | null} region
 * @property {string} createdAt
 * @property {Record<string, unknown>} metadata
 */

export const MAX_RECENT_BUFFER_PER_STORE = 100;
export const DEDUPE_WINDOW_MS = 30_000;

/** @type {Set<string>} */
export const STORE_ACTIVITY_TYPES = new Set([
  'store_viewed',
  'offer_viewed',
  'offer_claimed',
  'campaign_clicked',
  'campaign_shared',
  'customer_inquiry',
  'performer_recommendation_created',
  'performer_action_completed',
  'profile_completed',
  'content_published',
  'loyalty_started',
  'device_qr_scanned',
]);

/** @type {Record<string, string>} */
export const EVENT_TYPE_CATEGORY = {
  store_viewed: 'store_engagement',
  offer_viewed: 'store_engagement',
  offer_claimed: 'store_engagement',
  campaign_clicked: 'campaign',
  campaign_shared: 'campaign',
  customer_inquiry: 'store_engagement',
  performer_recommendation_created: 'performer',
  performer_action_completed: 'performer',
  profile_completed: 'store_profile',
  content_published: 'store_content',
  loyalty_started: 'loyalty',
  device_qr_scanned: 'store_engagement',
};

/** @type {Record<string, PlatformActivitySeverity>} */
export const EVENT_TYPE_DEFAULT_SEVERITY = {
  store_viewed: 'info',
  offer_viewed: 'info',
  offer_claimed: 'success',
  campaign_clicked: 'success',
  campaign_shared: 'info',
  customer_inquiry: 'warning',
  performer_recommendation_created: 'info',
  performer_action_completed: 'success',
  profile_completed: 'success',
  content_published: 'success',
  loyalty_started: 'success',
  device_qr_scanned: 'success',
};

/** @type {Record<string, string>} */
export const EVENT_TYPE_DEFAULT_TITLE = {
  store_viewed: 'Store visited',
  offer_viewed: 'Offer viewed',
  offer_claimed: 'Offer claimed',
  campaign_clicked: 'Campaign clicked',
  campaign_shared: 'Campaign shared',
  customer_inquiry: 'New customer inquiry',
  performer_recommendation_created: 'AI recommendation ready',
  performer_action_completed: 'Performer action completed',
  profile_completed: 'Profile updated',
  content_published: 'Content published',
  loyalty_started: 'Loyalty program started',
  device_qr_scanned: 'QR code scanned',
};

/** @type {Record<string, string>} */
export const EVENT_TYPE_DEFAULT_MESSAGE = {
  store_viewed: 'Someone viewed your storefront.',
  offer_viewed: 'A customer viewed one of your offers.',
  offer_claimed: 'A customer claimed an offer.',
  campaign_clicked: 'A campaign interaction was recorded.',
  campaign_shared: 'Your campaign was shared.',
  customer_inquiry: 'A new customer inquiry arrived.',
  performer_recommendation_created: 'Performer generated a new recommendation.',
  performer_action_completed: 'A Performer mission step completed.',
  profile_completed: 'Your business profile was updated.',
  content_published: 'New content is live on your store.',
  loyalty_started: 'A customer started your loyalty program.',
  device_qr_scanned: 'A QR code linked to your store was scanned.',
};
