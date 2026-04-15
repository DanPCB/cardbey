/**
 * Device Log Engine
 * Logging and event tracking for devices
 */

import { PrismaClient } from '@prisma/client';
import { broadcastSse } from '../../realtime/simpleSse.js';

const prisma = new PrismaClient();

export type DeviceLogLevel = 'info' | 'warn' | 'error' | 'debug';
export type DeviceLogSource = 'heartbeat' | 'command' | 'playlist' | 'system';

/**
 * Add a device log entry and broadcast via SSE
 */
export async function addDeviceLog(params: {
  deviceId: string;
  level?: DeviceLogLevel;
  source?: DeviceLogSource;
  message: string;
  payload?: any;
}) {
  const { deviceId, level = 'info', source = 'system', message, payload } = params;

  const log = await prisma.deviceLog.create({
    data: {
      deviceId,
      level,
      source,
      message,
      payload: payload ?? {},
    },
  });

  // Also emit via SSE
  broadcastSse(
    'admin',
    'device:log',
    {
      deviceId,
      id: log.id,
      level: log.level,
      source: log.source,
      message: log.message,
      payload: log.payload,
      createdAt: log.createdAt.toISOString(),
    }
  );

  return log;
}

/**
 * Get recent logs for a device
 */
export async function getRecentLogs(deviceId: string, limit = 100) {
  return prisma.deviceLog.findMany({
    where: { deviceId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

