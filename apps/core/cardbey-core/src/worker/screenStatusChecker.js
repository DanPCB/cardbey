/**
 * Screen Status Checker
 * Pings screens to check if they're online
 * Handles timeouts, errors, and backoff gracefully
 */

import { PrismaClient } from '@prisma/client';
import { httpGet } from '../lib/httpGet.js';

const prisma = new PrismaClient();

// Configuration from environment
const PING_PATH = process.env.SCREENS_PING_PATH || '/health';
const DEFAULT_PORT = Number(process.env.SCREENS_DEFAULT_PORT) || 5174;
const TIMEOUT_MS = Number(process.env.SCREENS_TIMEOUT_MS) || 3000;
const LOG_EVERY = Number(process.env.SCREENS_LOG_EVERY) || 20;
const SELF_PING = process.env.SCREENS_SELF_PING === '1' && process.env.NODE_ENV !== 'production';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const MAX_CONCURRENT = 10;

// In-memory state per screen
const screenState = new Map(); // screenId -> { targetUrl, consecutiveFailures, lastErrorType, lastErrorAt, lastOkAt, logCount }

// Simple concurrency limiter
class ConcurrencyLimiter {
  constructor(max) {
    this.max = max;
    this.running = 0;
    this.queue = [];
  }

  async run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.max || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

const limiter = new ConcurrencyLimiter(MAX_CONCURRENT);

/**
 * Derive target URL for a screen
 * @param {Object} screen - Screen record from database
 * @returns {string|null} - Target URL or null if cannot be determined
 */
function getTargetUrl(screen) {
  // If self-ping is enabled, ping our own health endpoint
  if (SELF_PING) {
    return `${API_BASE}/healthz`;
  }

  // If screen has explicit endpoint, use it
  if (screen.endpoint) {
    return screen.endpoint;
  }

  // If screen has IP and port, use them
  if (screen.ip && screen.port) {
    return `http://${screen.ip}:${screen.port}${PING_PATH}`;
  }

  // If screen has IP, use default port
  if (screen.ip) {
    return `http://${screen.ip}:${DEFAULT_PORT}${PING_PATH}`;
  }

  // Try to extract IP from location or name (heuristic)
  // Format: "IP:PORT" or just "IP"
  const location = screen.location || screen.name || '';
  const ipMatch = location.match(/(\d+\.\d+\.\d+\.\d+)(?::(\d+))?/);
  if (ipMatch) {
    const ip = ipMatch[1];
    const port = ipMatch[2] ? Number(ipMatch[2]) : DEFAULT_PORT;
    return `http://${ip}:${port}${PING_PATH}`;
  }

  // Cannot determine target
  return null;
}

/**
 * Check a single screen's status
 * @param {Object} screen - Screen record
 */
async function checkScreen(screen) {
  const screenId = screen.id;
  const state = screenState.get(screenId) || {
    targetUrl: null,
    consecutiveFailures: 0,
    lastErrorType: null,
    lastErrorAt: null,
    lastOkAt: null,
    logCount: 0,
  };

  // Determine target URL (log once when first computed or if changed)
  const targetUrl = getTargetUrl(screen);
  if (targetUrl !== state.targetUrl) {
    if (targetUrl) {
      console.log(`[ScreenStatus] target for ${screen.name || screenId}: ${targetUrl}`);
    }
    state.targetUrl = targetUrl;
  }

  // If no target URL, skip
  if (!targetUrl) {
    return;
  }

  // Check if we should back off (consecutive failures > 5)
  const shouldBackoff = state.consecutiveFailures > 5;
  const now = Date.now();
  if (shouldBackoff) {
    // Back off to once per minute
    if (state.lastErrorAt && (now - state.lastErrorAt) < 60000) {
      return; // Skip this check
    }
  }

  // Perform the ping
  const result = await httpGet(targetUrl, { timeoutMs: TIMEOUT_MS });

  if (result.ok) {
    // Success - mark as online
    const wasOffline = screen.status === 'OFFLINE';
    state.consecutiveFailures = 0;
    state.lastOkAt = new Date();
    state.lastErrorType = null;
    state.lastErrorAt = null;

    // Update database
    await prisma.screen.update({
      where: { id: screenId },
      data: {
        status: SELF_PING ? 'SIMULATED' : 'ONLINE',
        lastSeen: new Date(),
        statusText: SELF_PING ? 'simulated' : null,
      },
    });

    screenState.set(screenId, state);
  } else {
    // Failure - mark as offline
    state.consecutiveFailures++;
    state.lastErrorType = result.type;
    state.lastErrorAt = new Date();
    state.logCount++;

    // Log first failure and every Nth failure
    const shouldLog = state.logCount === 1 || state.logCount % LOG_EVERY === 0;
    if (shouldLog) {
      console.warn(
        `[ScreenStatus] ${screen.name || screenId} offline (${result.type}): ${targetUrl}`
      );
    }

    // Update database
    await prisma.screen.update({
      where: { id: screenId },
      data: {
        status: 'OFFLINE',
        statusText: result.type,
        // Store error info in statusText or a JSON field if available
      },
    });

    screenState.set(screenId, state);
  }
}

/**
 * Check all screens
 */
async function checkAllScreens() {
  try {
    const screens = await prisma.screen.findMany({
      where: {
        paired: true, // Only check paired screens
        deletedAt: null, // Exclude soft-deleted screens
      },
    });

    // Check screens with concurrency limit
    const promises = screens.map((screen) =>
      limiter.run(() => checkScreen(screen))
    );

    await Promise.allSettled(promises);
  } catch (error) {
    console.error('[ScreenStatus] Error checking screens:', error);
  }
}

/**
 * Start the screen status checker
 * @param {number} intervalMs - Check interval in milliseconds
 */
export function startScreenStatusChecker(intervalMs = 20000) {
  console.log(`✅ Starting screen status checker (${intervalMs}ms interval)...`);
  if (SELF_PING) {
    console.log('⚠️  Self-ping mode enabled (dev only)');
  }
  console.log(`   Ping path: ${PING_PATH}`);
  console.log(`   Default port: ${DEFAULT_PORT}`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms`);
  console.log(`   Max concurrent: ${MAX_CONCURRENT}`);

  // Initial check after a short delay
  setTimeout(() => {
    checkAllScreens();
  }, 5000);

  // Periodic checks
  setInterval(() => {
    checkAllScreens();
  }, intervalMs);
}

