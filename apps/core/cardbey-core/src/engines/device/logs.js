/**
 * Device Logs Service
 * Manages device activity and event logging
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Add a log entry for a device
 * 
 * @param {object} input - Log entry data
 * @param {string} input.deviceId - Device ID
 * @param {string} input.source - Log source ('command' | 'playlist' | 'heartbeat' | 'pairing' | 'screenshot' | 'system')
 * @param {string} input.level - Log level ('debug' | 'info' | 'warn' | 'error')
 * @param {string} input.message - Log message
 * @param {object} input.payload - Optional additional context data
 * @returns {Promise<object>} Created log entry
 */
export async function addDeviceLog(input) {
  const { deviceId, source, level = 'info', message, payload } = input;

  try {
    const log = await prisma.deviceLog.create({
      data: {
        deviceId,
        source,
        level,
        message,
        payload: payload || {},
      },
    });

    console.log(`[Device Logs] Added log: ${level} [${source}] ${message}`, { deviceId, logId: log.id });

    return {
      id: log.id,
      deviceId: log.deviceId,
      source: log.source,
      level: log.level,
      message: log.message,
      payload: log.payload,
      createdAt: log.createdAt,
    };
  } catch (error) {
    console.error('[Device Logs] Error adding log:', error);
    // Don't throw - logging failures shouldn't break the main flow
    return null;
  }
}

/**
 * Get recent logs for a device
 * 
 * @param {string} deviceId - Device ID
 * @param {object} options - Query options
 * @param {number} options.limit - Maximum number of logs to return (default: 50)
 * @param {string} options.source - Filter by source (optional)
 * @param {string} options.level - Filter by level (optional)
 * @param {Date} options.since - Only return logs after this date (optional)
 * @returns {Promise<Array>} Array of log entries
 */
export async function getRecentLogs(deviceId, options = {}) {
  const {
    limit = 50,
    source,
    level,
    since,
  } = options;

  try {
    const where = {
      deviceId,
    };

    if (source) {
      where.source = source;
    }

    if (level) {
      where.level = level;
    }

    if (since) {
      where.createdAt = {
        gte: since,
      };
    }

    const logs = await prisma.deviceLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      deviceId: log.deviceId,
      source: log.source,
      level: log.level,
      message: log.message,
      payload: log.payload || {},
      createdAt: log.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('[Device Logs] Error fetching logs:', error);
    return [];
  }
}

/**
 * Get logs for multiple devices (for dashboard)
 * 
 * @param {Array<string>} deviceIds - Array of device IDs
 * @param {object} options - Query options
 * @param {number} options.limit - Maximum number of logs per device (default: 20)
 * @returns {Promise<Array>} Array of log entries grouped by device
 */
export async function getLogsForDevices(deviceIds, options = {}) {
  const { limit = 20 } = options;

  if (!deviceIds || deviceIds.length === 0) {
    return [];
  }

  try {
    const logs = await prisma.deviceLog.findMany({
      where: {
        deviceId: { in: deviceIds },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit * deviceIds.length, // Rough limit, will be filtered per device
    });

    // Group by deviceId
    const grouped = {};
    for (const log of logs) {
      if (!grouped[log.deviceId]) {
        grouped[log.deviceId] = [];
      }
      if (grouped[log.deviceId].length < limit) {
        grouped[log.deviceId].push({
          id: log.id,
          deviceId: log.deviceId,
          source: log.source,
          level: log.level,
          message: log.message,
          payload: log.payload || {},
          createdAt: log.createdAt.toISOString(),
        });
      }
    }

    return grouped;
  } catch (error) {
    console.error('[Device Logs] Error fetching logs for devices:', error);
    return {};
  }
}

/**
 * Clear old logs for a device (cleanup)
 * 
 * @param {string} deviceId - Device ID
 * @param {number} daysToKeep - Number of days of logs to keep (default: 30)
 * @returns {Promise<number>} Number of logs deleted
 */
export async function clearOldLogs(deviceId, daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  try {
    const result = await prisma.deviceLog.deleteMany({
      where: {
        deviceId,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    if (result.count > 0) {
      console.log(`[Device Logs] Cleared ${result.count} old logs for device ${deviceId}`);
    }

    return result.count;
  } catch (error) {
    console.error('[Device Logs] Error clearing old logs:', error);
    return 0;
  }
}

