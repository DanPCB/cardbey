/**
 * Device Commands Service
 * Manages device commands using the DeviceCommand database model
 */

import { PrismaClient } from '@prisma/client';

// Use a singleton Prisma instance to avoid connection issues
// Initialize immediately to ensure it's available
const prisma = new PrismaClient();

/**
 * Device Command Types
 * @typedef {'play' | 'pause' | 'next' | 'previous' | 'reloadPlaylist' | 'setPlaylistIndex' | 'setVolume' | 'setBrightness' | 'screenshot'} DeviceCommandType
 */

/**
 * Device Command Payload
 * @typedef {Object} DeviceCommandPayload
 * @property {number} [index] - Playlist index (for setPlaylistIndex)
 * @property {number} [volume] - Volume level 0-1 (for setVolume)
 * @property {number} [brightness] - Brightness level 0-1 (for setBrightness)
 */

/**
 * Enqueue a command for a device
 * 
 * @param {string} deviceId - Device ID
 * @param {DeviceCommandType} type - Command type
 * @param {DeviceCommandPayload} payload - Optional command payload
 * @returns {Promise<object>} Created command
 */
export async function enqueueDeviceCommand(deviceId, type, payload = {}) {
  const command = await prisma.deviceCommand.create({
    data: {
      deviceId,
      type,
      payload: payload || {},
      status: 'pending',
    },
  });

  console.log(`[Device Commands] Queued command ${command.id} (${type}) for device ${deviceId}`);

  return {
    id: command.id,
    type: command.type,
    payload: command.payload,
    status: command.status,
    createdAt: command.createdAt,
  };
}

/**
 * Get pending commands for a device
 * 
 * @param {string} deviceId - Device ID
 * @returns {Promise<Array>} Array of pending commands
 */
export async function getPendingCommandsForDevice(deviceId) {
  try {
    // Defensive check
    if (!prisma) {
      console.error('[Device Commands] Prisma client is not initialized');
      return [];
    }
    
    if (!prisma.deviceCommand) {
      console.error('[Device Commands] deviceCommand model not available. Prisma client may need regeneration.');
      return [];
    }

    const commands = await prisma.deviceCommand.findMany({
      where: {
        deviceId,
        status: 'pending',
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 20, // Limit to 20 commands per heartbeat
    });

    return commands.map((cmd) => ({
      id: cmd.id,
      type: cmd.type,
      payload: cmd.payload || {},
      status: cmd.status,
      createdAt: cmd.createdAt,
    }));
  } catch (error) {
    console.error('[Device Commands] Error fetching pending commands:', error);
    // Return empty array on error to prevent heartbeat from failing
    return [];
  }
}

/**
 * Mark commands as executed
 * 
 * @param {Array<string>} commandIds - Array of command IDs to mark as executed
 */
export async function markCommandsAsExecuted(commandIds) {
  if (!commandIds || commandIds.length === 0) {
    return;
  }

  await prisma.deviceCommand.updateMany({
    where: {
      id: { in: commandIds },
    },
    data: {
      status: 'executed',
      updatedAt: new Date(),
    },
  });

  console.log(`[Device Commands] Marked ${commandIds.length} commands as executed`);
}

/**
 * Mark commands as sent (being delivered to device)
 * 
 * @param {Array<string>} commandIds - Array of command IDs to mark as sent
 */
export async function markCommandsAsSent(commandIds) {
  if (!commandIds || commandIds.length === 0) {
    return;
  }

  await prisma.deviceCommand.updateMany({
    where: {
      id: { in: commandIds },
    },
    data: {
      status: 'sent',
      updatedAt: new Date(),
    },
  });

  console.log(`[Device Commands] Marked ${commandIds.length} commands as sent`);
}

/**
 * Mark a command as failed
 * 
 * @param {string} commandId - Command ID
 * @param {string} reason - Failure reason
 */
export async function markCommandAsFailed(commandId, reason) {
  const existing = await prisma.deviceCommand.findUnique({
    where: { id: commandId },
    select: { payload: true },
  });

  await prisma.deviceCommand.update({
    where: { id: commandId },
    data: {
      status: 'failed',
      payload: {
        ...(existing?.payload || {}),
        error: reason,
      },
      updatedAt: new Date(),
    },
  });

  console.log(`[Device Commands] Marked command ${commandId} as failed: ${reason}`);
}

/**
 * Clear all pending commands for a device
 * 
 * @param {string} deviceId - Device ID
 */
export async function clearPendingCommands(deviceId) {
  const result = await prisma.deviceCommand.updateMany({
    where: {
      deviceId,
      status: 'pending',
    },
    data: {
      status: 'failed',
      updatedAt: new Date(),
    },
  });

  console.log(`[Device Commands] Cleared ${result.count} pending commands for device ${deviceId}`);
}

