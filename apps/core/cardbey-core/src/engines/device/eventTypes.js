/**
 * Device Engine Event Types
 * TypeScript-style type definitions for Device Engine SSE events
 */

/**
 * @typedef {Object} PairRequestCreatedPayload
 * @property {string} pairRequestId - Device ID (acts as pair request ID)
 * @property {string} code - Pairing code (6 characters)
 * @property {string} expiresAt - ISO timestamp when code expires
 * @property {Object} [deviceInfo] - Optional device information
 * @property {string} [deviceInfo.deviceId] - Device ID
 * @property {string} [deviceInfo.model] - Device model
 * @property {string} [deviceInfo.platform] - Platform identifier
 * @property {string} [deviceInfo.appVersion] - App version
 */

/**
 * @typedef {Object} DevicePairedPayload
 * @property {string} deviceId - Device ID
 * @property {string} pairRequestId - Original device ID (same as deviceId for Device Engine)
 * @property {string} [name] - Device name
 * @property {string} [tenantId] - Tenant ID
 * @property {string} [storeId] - Store ID
 */

/**
 * @typedef {Object} DeviceStatusChangedPayload
 * @property {string} deviceId - Device ID
 * @property {string} status - "online" | "offline" | "degraded"
 * @property {string} lastSeenAt - ISO timestamp
 */

/**
 * @typedef {Object} PlaylistAssignedPayload
 * @property {string} deviceId - Device ID
 * @property {string} playlistId - Playlist ID
 */

/**
 * Device Engine Event Union Type
 * @typedef {(
 *   | { type: "pair_request_created"; payload: PairRequestCreatedPayload }
 *   | { type: "device_paired"; payload: DevicePairedPayload }
 *   | { type: "device_status_changed"; payload: DeviceStatusChangedPayload }
 *   | { type: "playlist_assigned"; payload: PlaylistAssignedPayload }
 * )} DeviceEngineEvent
 */

// Export for use in JSDoc
export const DeviceEngineEventTypes = {
  PAIR_REQUEST_CREATED: 'pair_request_created',
  DEVICE_PAIRED: 'device_paired',
  DEVICE_STATUS_CHANGED: 'device_status_changed',
  PLAYLIST_ASSIGNED: 'playlist_assigned',
};




