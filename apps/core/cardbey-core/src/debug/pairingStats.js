/**
 * Pairing Statistics Debug Module
 * 
 * ⚠️ FOR LOCAL/DEV ONLY - NOT FOR PRODUCTION
 * 
 * Tracks lightweight counters for pairing endpoint usage.
 * In-memory only, resets on server restart.
 */

const pairingStats = {
  initiateCount: 0,
  peekCount: 0,
  registerCount: 0,
  completeCount: 0,
};

/**
 * Record an initiate event
 */
export function recordInitiate() {
  pairingStats.initiateCount++;
}

/**
 * Record a peek event
 */
export function recordPeek() {
  pairingStats.peekCount++;
}

/**
 * Record a register event
 */
export function recordRegister() {
  pairingStats.registerCount++;
}

/**
 * Record a complete event
 */
export function recordComplete() {
  pairingStats.completeCount++;
}

/**
 * Get a snapshot of current stats
 * @returns {Object} Stats object
 */
export function snapshotPairingStats() {
  return { ...pairingStats };
}

/**
 * Reset all stats to zero
 */
export function resetPairingStats() {
  pairingStats.initiateCount = 0;
  pairingStats.peekCount = 0;
  pairingStats.registerCount = 0;
  pairingStats.completeCount = 0;
}

