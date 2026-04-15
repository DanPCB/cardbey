/**
 * Offline Watcher
 * Marks screens and devices as offline if they haven't sent a heartbeat within HEARTBEAT_TIMEOUT_MS
 * Skips gracefully when Screen/Device tables do not exist (e.g. test DB or minimal schema).
 */

import { getPrismaClient } from '../db/prisma.js';
import { HEARTBEAT_TIMEOUT_MS } from '../constants/devicePresence.js';
import { broadcast } from '../realtime/sse.js';
import { getEventEmitter, DEVICE_EVENTS } from '../engines/device/events.js';

const prisma = getPrismaClient();
const events = getEventEmitter();

// Configuration — must match GET /api/device/list + heartbeat presence
const OFFLINE_THRESHOLD_MS = HEARTBEAT_TIMEOUT_MS;
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

const IS_DEV = process.env.NODE_ENV !== 'production';

// P2021 = table does not exist (e.g. test.db without Screen/Device)
const PRISMA_TABLE_MISSING = 'P2021';
let screensTableMissingLogged = false;
let devicesTableMissingLogged = false;

/**
 * Check for screens that should be marked offline
 */
async function checkOfflineScreens() {
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);

    // Find screens that are online but haven't been seen recently
    const screensToMarkOffline = await prisma.screen.findMany({
      where: {
        status: 'ONLINE',
        deletedAt: null,
        OR: [
          { lastSeen: null },
          { lastSeen: { lt: threshold } },
        ],
      },
      select: {
        id: true,
        name: true,
        lastSeen: true,
      },
    });

    // Mark each screen as offline and emit SSE event
    for (const screen of screensToMarkOffline) {
      // Calculate time difference in seconds for debug logging
      const timeDiffSeconds = screen.lastSeen
        ? Math.round((now.getTime() - screen.lastSeen.getTime()) / 1000)
        : null;
      
      await prisma.screen.update({
        where: { id: screen.id },
        data: {
          status: 'OFFLINE',
        },
      });

      // Debug log: Print time difference in seconds when screen is marked offline
      console.log(`[OfflineWatcher] Marked screen ${screen.id} (${screen.name || 'unnamed'}) as offline - time since last seen: ${timeDiffSeconds !== null ? `${timeDiffSeconds}s` : 'never'} (threshold: ${OFFLINE_THRESHOLD_MS / 1000}s)`);

      broadcast('screen.offline', {
        id: screen.id,
        name: screen.name,
      });
    }

    if (screensToMarkOffline.length > 0) {
      console.log(`[OfflineWatcher] Marked ${screensToMarkOffline.length} screen(s) as offline`);
    }
  } catch (error) {
    if (error?.code === PRISMA_TABLE_MISSING) {
      if (!screensTableMissingLogged) {
        screensTableMissingLogged = true;
        console.warn('[OfflineWatcher] Screen table missing in database (e.g. test DB); skipping offline screens check.');
      }
      return;
    }
    console.error('[OfflineWatcher] Error checking offline screens:', error);
  }
}

/**
 * Check for devices that should be marked offline (A.2)
 */
async function checkOfflineDevices() {
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);

    // Find devices that are online but haven't been seen recently
    const devicesToMarkOffline = await prisma.device.findMany({
      where: {
        status: 'online',
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: threshold } },
        ],
      },
      select: {
        id: true,
        lastSeenAt: true,
      },
    });

    // Mark each device as offline and emit SSE event
    for (const device of devicesToMarkOffline) {
      // Calculate time difference in seconds for debug logging
      const timeDiffSeconds = device.lastSeenAt
        ? Math.round((now.getTime() - device.lastSeenAt.getTime()) / 1000)
        : null;
      
      const updated = await prisma.device.update({
        where: { id: device.id },
        data: {
          status: 'offline',
        },
      });

      // Debug log: Print time difference in seconds when device is marked offline
      console.log(`[OfflineWatcher] Marked device ${device.id} as offline - time since last heartbeat: ${timeDiffSeconds !== null ? `${timeDiffSeconds}s` : 'never'} (threshold: ${OFFLINE_THRESHOLD_MS / 1000}s)`);
      if (IS_DEV) {
        console.log(
          `[OFFLINE_CHECK] deviceId=${device.id} lastSeen=${device.lastSeenAt?.toISOString?.() || 'null'} delta=${timeDiffSeconds !== null ? `${timeDiffSeconds}s` : 'never'}`
        );
      }

      // Emit Device Engine event (will be broadcast to SSE as device_status_changed)
      await events.emit(DEVICE_EVENTS.OFFLINE_DETECTED, {
        deviceId: device.id,
        lastSeenAt: updated.lastSeenAt?.toISOString() || null,
      });
      
      // Also emit DeviceEngine V2 status.changed event
      try {
        const { emitDeviceEvent, DEVICE_ENGINE_EVENT_TYPES } = await import('../engines/device/deviceEvents.js');
        emitDeviceEvent({
          type: DEVICE_ENGINE_EVENT_TYPES.STATUS_CHANGED,
          payload: {
            deviceId: device.id,
            status: 'offline',
            lastSeenAt: updated.lastSeenAt?.toISOString() || null,
          },
        });
      } catch (eventError) {
        console.warn('[OfflineWatcher] Failed to emit DeviceEngine V2 status.changed event (non-fatal):', eventError.message);
      }

      // Also emit legacy SSE event for backward compatibility
      broadcast('device:update', {
        deviceId: device.id,
        status: 'offline',
        lastSeenAt: updated.lastSeenAt?.toISOString() || null,
      }, { key: 'admin' });
    }

    if (devicesToMarkOffline.length > 0) {
      console.log(`[OfflineWatcher] Marked ${devicesToMarkOffline.length} device(s) as offline`);
    }
  } catch (error) {
    if (error?.code === PRISMA_TABLE_MISSING) {
      if (!devicesTableMissingLogged) {
        devicesTableMissingLogged = true;
        console.warn('[OfflineWatcher] Device table missing in database (e.g. test DB); skipping offline devices check.');
      }
      return;
    }
    console.error('[OfflineWatcher] Error checking offline devices:', error);
  }
}

/**
 * Start the offline watcher
 */
export function startOfflineWatcher() {
  console.log(`✅ Starting offline watcher (checking every ${CHECK_INTERVAL_MS / 1000}s, threshold: ${OFFLINE_THRESHOLD_MS / 1000}s)...`);

  // Initial check after a short delay
  setTimeout(() => {
    checkOfflineScreens();
    checkOfflineDevices();
  }, 5000);

  // Periodic checks
  setInterval(() => {
    checkOfflineScreens();
    checkOfflineDevices();
  }, CHECK_INTERVAL_MS);
}

