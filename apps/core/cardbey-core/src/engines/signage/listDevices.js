/**
 * List paired devices for a store with optional online filter and current playlist from bindings.
 */

import { getPrismaClient } from '../../db/prisma.js';

const prisma = getPrismaClient();

/** @param {object} input @param {object} [ctx] */
export const listDevices = async (input, ctx) => {
  const { tenantId, storeId, status } = input;
  const db = ctx?.services?.db || prisma;

  const statusFilter = status === 'online' ? { status: 'online' } : {};

  const devices = await db.device.findMany({
    where: {
      tenantId,
      storeId,
      // Device.archivedAt is not present; omit to avoid Prisma validation errors.
      ...statusFilter,
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const ids = devices.map((d) => d.id);
  const bindings =
    ids.length > 0
      ? await db.devicePlaylistBinding.findMany({
          where: { deviceId: { in: ids } },
          orderBy: { lastPushedAt: 'desc' },
        })
      : [];

  const latestByDevice = new Map();
  for (const b of bindings) {
    if (!latestByDevice.has(b.deviceId)) {
      latestByDevice.set(b.deviceId, b);
    }
  }

  const playlistIds = [...new Set([...latestByDevice.values()].map((b) => b.playlistId))];
  const playlists =
    playlistIds.length > 0
      ? await db.playlist.findMany({
          where: { id: { in: playlistIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(playlists.map((p) => [p.id, p.name]));

  const rows = devices.map((d) => {
    const b = latestByDevice.get(d.id);
    const pid = b?.playlistId ?? null;
    return {
      deviceId: d.id,
      name: (d.name && d.name.trim()) || d.id.slice(0, 8),
      location: (d.location && d.location.trim()) || '',
      status: d.status,
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      currentPlaylistId: pid,
      currentPlaylistName: pid ? (nameById.get(pid) ?? null) : null,
    };
  });

  return {
    ok: true,
    data: {
      devices: rows,
      count: rows.length,
    },
  };
};
