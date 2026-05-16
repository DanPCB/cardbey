/**
 * Performer / mission executor: signage.list-devices
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { listDevices } from '../../../engines/signage/listDevices.js';
import { ListDevicesInput } from '../../../engines/signage/types.js';

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const merged = {
    tenantId: input.tenantId ?? context.tenantId,
    storeId: input.storeId ?? context.storeId,
    status: input.status === 'online' || input.status === 'all' ? input.status : undefined,
  };
  const parsed = ListDevicesInput.safeParse(merged);
  if (!parsed.success) {
    const msg = parsed.error?.errors?.[0]?.message || parsed.error?.message || 'Invalid input';
    return {
      status: 'failed',
      error: { code: 'INVALID_INPUT', message: msg },
    };
  }

  try {
    const out = await listDevices(parsed.data, {
      services: { db: getPrismaClient() },
    });
    return {
      status: 'ok',
      output: {
        message: `Found ${out.data.count} screen(s).`,
        count: out.data.count,
        devices: out.data.devices,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'EXECUTION_ERROR', message },
    };
  }
}
