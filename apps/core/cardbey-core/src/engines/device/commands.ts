/**
 * Device Command Engine
 * Queue and manage commands for devices
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type DeviceCommandType =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'reloadPlaylist'
  | 'setPlaylistIndex';

export interface DeviceCommandPayload {
  index?: number; // for setPlaylistIndex
  [key: string]: unknown;
}

/**
 * Enqueue a command for a device
 */
export async function enqueueDeviceCommand(
  deviceId: string,
  type: DeviceCommandType,
  payload?: DeviceCommandPayload
) {
  return prisma.deviceCommand.create({
    data: {
      deviceId,
      type,
      payload: payload ?? {},
      status: 'pending',
    },
  });
}

/**
 * Get pending commands for a device
 */
export async function getPendingCommandsForDevice(deviceId: string) {
  return prisma.deviceCommand.findMany({
    where: {
      deviceId,
      status: 'pending',
    },
    orderBy: { createdAt: 'asc' },
    take: 20, // Limit to prevent overwhelming the device
  });
}

/**
 * Mark commands as executed
 */
export async function markCommandsAsExecuted(ids: string[]) {
  if (!ids.length) return;
  await prisma.deviceCommand.updateMany({
    where: { id: { in: ids } },
    data: { status: 'executed' },
  });
}

/**
 * Mark commands as sent (when delivered to device)
 */
export async function markCommandsAsSent(ids: string[]) {
  if (!ids.length) return;
  await prisma.deviceCommand.updateMany({
    where: { id: { in: ids } },
    data: { status: 'sent' },
  });
}

