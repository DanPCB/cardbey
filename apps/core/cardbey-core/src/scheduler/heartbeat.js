/**
 * Scheduler Heartbeat
 * Lightweight in-memory heartbeat tracker for health checks
 */

let lastHeartbeat = null;
let heartbeatInterval = null;
let isRunning = false;

/**
 * Start the heartbeat timer
 * @param {number} intervalMs - Interval between heartbeats (default: 30000 = 30s)
 */
export function startHeartbeat(intervalMs = 30000) {
  if (isRunning) {
    console.log('[Scheduler] Heartbeat already running');
    return;
  }

  // Initial heartbeat
  lastHeartbeat = Date.now();
  isRunning = true;

  // Set up interval
  heartbeatInterval = setInterval(() => {
    lastHeartbeat = Date.now();
    // Log at debug level only (can be filtered)
    if (process.env.DEBUG?.includes('scheduler')) {
      console.log(`[Scheduler] Heartbeat tick at ${new Date(lastHeartbeat).toISOString()}`);
    }
  }, intervalMs);

  console.log(`[Scheduler] ✅ Heartbeat started (interval: ${intervalMs}ms)`);
}

/**
 * Stop the heartbeat timer
 */
export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    isRunning = false;
    console.log('[Scheduler] Heartbeat stopped');
  }
}

/**
 * Get the last heartbeat timestamp
 * @returns {number|null} Timestamp in milliseconds, or null if never started
 */
export function getLastHeartbeat() {
  return lastHeartbeat;
}

/**
 * Check if scheduler is healthy
 * @param {number} maxAgeMs - Maximum age of last heartbeat (default: 120000 = 2 minutes)
 * @returns {boolean}
 */
export function isHealthy(maxAgeMs = 120000) {
  if (!lastHeartbeat) {
    return false;
  }
  const age = Date.now() - lastHeartbeat;
  return age < maxAgeMs;
}

/**
 * Get scheduler status for health endpoint
 * @returns {{ ok: boolean, lastHeartbeat: string|null }}
 */
export function getStatus() {
  const healthy = isHealthy();
  return {
    ok: healthy,
    lastHeartbeat: lastHeartbeat ? new Date(lastHeartbeat).toISOString() : null,
  };
}

