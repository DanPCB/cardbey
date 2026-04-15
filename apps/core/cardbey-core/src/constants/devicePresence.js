/**
 * Device Engine V2 — presence / heartbeat thresholds (single source for API + offline watcher).
 * HEARTBEAT_TIMEOUT: device considered offline if no heartbeat for this long.
 * Keep well above client heartbeat interval (e.g. 30s) to avoid offline flicker (3×+ margin).
 */
export const HEARTBEAT_TIMEOUT_MS = 180 * 1000; // 3 minutes (was 120s)
/** UI "green" tier — last seen within this window */
export const PRESENCE_ONLINE_MS = 30 * 1000; // 30 seconds
/** Client playback report considered fresh for presence / "playing_degraded" logic */
export const PLAYBACK_REPORT_FRESH_MS = 5 * 60 * 1000; // 5 minutes
/** Inactivity before a device is labeled stale (still listed unless filtered) */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Eligible for manual archive (informational; no auto-delete) */
export const ARCHIVE_ELIGIBLE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
