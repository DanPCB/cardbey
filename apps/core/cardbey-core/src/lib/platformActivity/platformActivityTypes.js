/** @typedef {'info' | 'success' | 'warning' | 'critical'} PlatformActivitySeverity */
/** @typedef {'user' | 'system' | 'admin' | 'device' | 'performer'} PlatformActivityActorType */

/**
 * @typedef {Object} PlatformActivityEvent
 * @property {string} id
 * @property {string} type
 * @property {string} category
 * @property {PlatformActivitySeverity} severity
 * @property {PlatformActivityActorType} actorType
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

export const MAX_RECENT_BUFFER = 500;
export const DEDUPE_WINDOW_MS = 60_000;

/** @type {Record<string, string>} */
export const EVENT_TYPE_CATEGORY = {
  business_seed_created: 'business_discovery',
  business_seed_qa_approved: 'business_discovery',
  business_seed_rejected: 'business_discovery',
  business_claim_started: 'business_discovery',
  business_claim_verified: 'business_discovery',
  business_activated: 'business_discovery',
  business_activation_started: 'business_discovery',
  ownership_verification_started: 'business_discovery',
  ownership_verified: 'business_discovery',
  business_space_activated: 'business_discovery',
  performer_opened_after_activation: 'business_discovery',
  activation_failed: 'business_discovery',
  user_registered: 'user_account',
  user_email_verified: 'user_account',
  business_owner_created: 'user_account',
  account_verification_failed: 'user_account',
  draft_store_created: 'store_lifecycle',
  draft_store_reviewed: 'store_lifecycle',
  store_published: 'store_lifecycle',
  store_activation_failed: 'store_lifecycle',
  performer_session_started: 'runtime_performer',
  mission_started: 'runtime_performer',
  mission_blocked: 'runtime_performer',
  mission_completed: 'runtime_performer',
  mission_failed: 'runtime_performer',
  device_pair_requested: 'cnet_devices',
  device_paired: 'cnet_devices',
  device_online: 'cnet_devices',
  device_offline: 'cnet_devices',
  playlist_started: 'cnet_devices',
  playlist_failed: 'cnet_devices',
  heartbeat_missing: 'cnet_devices',
  deployment_detected: 'system_admin',
  api_error_spike: 'system_admin',
  queue_backlog: 'system_admin',
  admin_qa_action: 'system_admin',
  data_source_ingest_completed: 'system_admin',
};

/** @type {Record<string, PlatformActivitySeverity>} */
export const EVENT_TYPE_DEFAULT_SEVERITY = {
  business_seed_qa_approved: 'success',
  business_claim_started: 'info',
  ownership_verification_started: 'info',
  business_activation_started: 'info',
  ownership_verified: 'success',
  business_claim_verified: 'success',
  business_activated: 'success',
  business_space_activated: 'success',
  performer_opened_after_activation: 'success',
  activation_failed: 'warning',
  user_registered: 'success',
  device_paired: 'success',
  mission_failed: 'warning',
  business_seed_rejected: 'warning',
  account_verification_failed: 'warning',
  store_activation_failed: 'critical',
  mission_blocked: 'warning',
  device_offline: 'warning',
  playlist_failed: 'critical',
  heartbeat_missing: 'warning',
  api_error_spike: 'critical',
  queue_backlog: 'warning',
};
