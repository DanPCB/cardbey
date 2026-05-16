/**
 * Session Cleanup Worker
 * Removes expired and old completed sessions from memory
 */

import { expireSessions, getAllActiveSessions, cleanupOldSessions, getActiveSessionCount } from '../pair/sessionStore.js';

// Configuration
const CLEANUP_INTERVAL_MS = 60 * 1000; // Run every minute
const MAX_AGE_COMPLETED_MS = 24 * 60 * 60 * 1000; // Keep completed sessions for 24 hours

/**
 * Clean up old sessions
 */
function cleanupSessions() {
  try {
    // First, expire any sessions that should be expired
    expireSessions();

    // Remove old completed/expired sessions
    const removed = cleanupOldSessions(MAX_AGE_COMPLETED_MS);
    const activeCount = getActiveSessionCount();
    
    if (removed > 0) {
      console.log(`[SessionCleanup] Removed ${removed} old session(s), ${activeCount} active`);
    }
  } catch (error) {
    console.error('[SessionCleanup] Error cleaning up sessions:', error);
  }
}

/**
 * Start the session cleanup worker
 */
export function startSessionCleanup() {
  console.log(`✅ Starting session cleanup worker (interval: ${CLEANUP_INTERVAL_MS / 1000}s)...`);

  // Initial cleanup after a short delay
  setTimeout(() => {
    cleanupSessions();
  }, 10000); // 10 seconds

  // Periodic cleanup
  setInterval(() => {
    cleanupSessions();
  }, CLEANUP_INTERVAL_MS);
}

