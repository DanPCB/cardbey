/**
 * Performer / mission executor: signage.publish-to-devices
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { publishToDevices } from '../../../engines/signage/publishToDevices.js';
import { PublishToDevicesInput } from '../../../engines/signage/types.js';

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const merged = {
    tenantId: input.tenantId ?? context.tenantId,
    storeId: input.storeId ?? context.storeId,
    playlistId: input.playlistId ?? null,
    deviceIds: Array.isArray(input.deviceIds) ? input.deviceIds : undefined,
    pushToAll: input.pushToAll === true,
  };
  const parsed = PublishToDevicesInput.safeParse(merged);
  if (!parsed.success) {
    const msg = parsed.error?.errors?.[0]?.message || parsed.error?.message || 'Invalid input';
    return {
      status: 'failed',
      error: { code: 'INVALID_INPUT', message: msg },
    };
  }

  try {
    const out = await publishToDevices(parsed.data, {
      services: { db: getPrismaClient() },
      userId: context.userId ?? null,
    });

    const d = out.data;
    if (d.mode === 'explicit') {
      if (out.ok === false) {
        return {
          status: 'failed',
          error: {
            code: 'PLAYLIST_OR_STORE',
            message:
              'Playlist not found, inactive, or not a SIGNAGE playlist for this store. Check playlistId and store context.',
          },
          output: {
            message: 'Could not push — playlist missing or not allowed for this store.',
            pushed: 0,
            failed: d.failed ?? 0,
            devices: d.devices ?? [],
            playlistName: d.playlistName,
            playlistId: d.playlistId,
          },
        };
      }

      const pushed = d.pushed ?? 0;
      const failed = d.failed ?? 0;
      const name = d.playlistName || d.playlistId || 'playlist';
      const msg =
        pushed > 0
          ? `Pushed "${name}" to ${pushed} screen(s)${failed ? ` (${failed} failed).` : '.'}`
          : failed > 0
            ? `Could not push "${name}" (${failed} failed).`
            : `No screens to push "${name}" to.`;

      return {
        status: pushed > 0 ? 'ok' : 'failed',
        output: {
          message: msg,
          pushed,
          failed,
          devices: d.devices ?? [],
          playlistName: d.playlistName,
          playlistId: d.playlistId,
        },
        ...(pushed === 0
          ? {
              error: {
                code: 'NO_PUSH',
                message: failed > 0 ? msg : 'No target screens or all pushes failed.',
              },
            }
          : {}),
      };
    }

    return {
      status: 'ok',
      output: {
        message: `Schedule-based publish touched ${d.devicesUpdated ?? 0} device binding(s).`,
        devicesUpdated: d.devicesUpdated,
        mode: 'schedule',
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
