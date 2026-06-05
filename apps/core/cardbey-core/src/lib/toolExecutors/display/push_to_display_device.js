/**
 * push_to_display_device — Queue content push to a paired display (Phase 3: stub payload).
 */

import { randomUUID } from 'node:crypto';

/**
 * @param {object} [input]
 * @param {string|null} [input.deviceId]
 * @param {string} [input.storeId]
 * @param {object} [input.formatted]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  try {
    const deviceId =
      (typeof input?.deviceId === 'string' && input.deviceId.trim()) ||
      (typeof context?.deviceId === 'string' && context.deviceId.trim()) ||
      null;

    const storeId =
      (typeof input?.storeId === 'string' && input.storeId.trim()) ||
      (typeof context?.storeId === 'string' && context.storeId.trim()) ||
      null;

    const formatted =
      input?.formatted && typeof input.formatted === 'object' ? input.formatted : {};

    const pushId = randomUUID();

    return {
      status: 'ok',
      output: {
        ok: true,
        pushId,
        deviceId,
        storeId,
        status: 'queued',
        queuedAt: new Date().toISOString(),
        payload: {
          deviceId,
          storeId,
          formatted,
        },
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'PUSH_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;
