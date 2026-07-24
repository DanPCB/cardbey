export type DisplayTelemetryEventType =
  | 'APP_STARTED'
  | 'PAIRING_STARTED'
  | 'PAIRING_COMPLETED'
  | 'MANIFEST_SYNCED'
  | 'MANIFEST_REJECTED'
  | 'PLAYLIST_ACTIVATED'
  | 'PLAYLIST_STARTED'
  | 'ITEM_PREPARING'
  | 'ITEM_STARTED'
  | 'ITEM_COMPLETED'
  | 'ITEM_SKIPPED'
  | 'ITEM_FAILED'
  | 'MEDIA_ERROR'
  | 'MEDIA_LOAD_TIMEOUT'
  | 'MEDIA_STALL_RECOVERY'
  | 'PLAYBACK_PAUSED'
  | 'PLAYBACK_RESUMED'
  | 'PLAYBACK_STOPPED'
  | 'PLAYBACK_STALLED'
  | 'ALL_ITEMS_FAILED'
  | 'OFFLINE_ENTERED'
  | 'ONLINE_RESTORED'
  | 'APP_SUSPENDED'
  | 'APP_RESUMED'
  | 'CACHE_CLEARED'
  | 'DEVICE_UNPAIRED';

export type DisplayTelemetryEvent = {
  id: string;
  type: DisplayTelemetryEventType;
  occurredAt: string;
  deviceId?: string;
  playlistId?: string;
  itemId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Device V2 does not yet expose a dedicated batched telemetry upload route.
 * Shells may map events onto heartbeat meta / pair-alert later.
 */
export interface TelemetrySink {
  send(events: DisplayTelemetryEvent[]): Promise<void>;
}
