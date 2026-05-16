/**
 * Device Command Queue
 * Manages pending commands for devices
 * Uses in-memory store (can be migrated to database later)
 */

// In-memory command store
// Format: { deviceId: [{ id, type, payload, createdAt }] }
const commandStore = new Map();

/**
 * Command types
 */
export const CommandType = {
  RELOAD: 'reload',
  NEXT: 'next',
  PREV: 'prev',
  PAUSE: 'pause',
  RESUME: 'resume',
  REPAIR: 'repair',
  SET_BRIGHTNESS: 'setBrightness',
};

/**
 * Add a command to the queue for a device
 * 
 * @param {string} deviceId - Device ID
 * @param {string} type - Command type
 * @param {object} payload - Optional command payload
 * @returns {Promise<object>} Created command
 */
export async function queueCommand(deviceId, type, payload = {}) {
  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  const command = {
    id: commandId,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };

  if (!commandStore.has(deviceId)) {
    commandStore.set(deviceId, []);
  }

  const commands = commandStore.get(deviceId);
  commands.push(command);

  console.log(`[Device Command Queue] Queued command ${commandId} (${type}) for device ${deviceId}`);

  return command;
}

/**
 * Get pending commands for a device
 * 
 * @param {string} deviceId - Device ID
 * @returns {Promise<Array>} Array of pending commands
 */
export async function getPendingCommands(deviceId) {
  return commandStore.get(deviceId) || [];
}

/**
 * Mark commands as executed
 * 
 * @param {string} deviceId - Device ID
 * @param {Array<string>} commandIds - Array of command IDs to mark as executed
 */
export async function markCommandsExecuted(deviceId, commandIds) {
  if (!commandStore.has(deviceId)) {
    return;
  }

  const commands = commandStore.get(deviceId);
  const remainingCommands = commands.filter(
    (cmd) => !commandIds.includes(cmd.id)
  );

  commandStore.set(deviceId, remainingCommands);

  if (commandIds.length > 0) {
    console.log(`[Device Command Queue] Marked ${commandIds.length} commands as executed for device ${deviceId}`);
  }
}

/**
 * Clear all commands for a device
 * 
 * @param {string} deviceId - Device ID
 */
export async function clearCommands(deviceId) {
  commandStore.delete(deviceId);
  console.log(`[Device Command Queue] Cleared all commands for device ${deviceId}`);
}
