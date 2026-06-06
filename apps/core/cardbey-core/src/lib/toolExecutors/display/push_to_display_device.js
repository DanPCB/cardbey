/**
 * push_to_display_device — Queue content push to a paired display (not wired to device transport).
 */

import { randomUUID } from 'node:crypto';
import { executeContentTool } from '../executeContentTool.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeContentTool({
    toolName: 'push_to_display_device',
    input,
    context,
    processor: (inp, ctx) => {
      const deviceId =
        (typeof inp?.deviceId === 'string' && inp.deviceId.trim()) ||
        (typeof ctx?.deviceId === 'string' && ctx.deviceId.trim()) ||
        null;

      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const formatted =
        inp?.formatted && typeof inp.formatted === 'object' ? inp.formatted : {};

      return {
        pushId: randomUUID(),
        deviceId,
        storeId,
        status: 'queued',
        queuedAt: new Date().toISOString(),
        payload: { deviceId, storeId, formatted },
        stub: true,
      };
    },
    validateResult: () => ({
      blocked: true,
      reason: 'display_push_not_wired',
      message: 'Display device push is not connected to device transport yet',
    }),
    isEmpty: () => false,
  });
}

export default execute;
