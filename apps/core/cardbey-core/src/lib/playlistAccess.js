/**
 * Shared signage playlist access guard for signageRoutes.
 */

import {
  assertSignagePlaylistAccess,
  resolvePlaylistScopeFromRequest,
} from './playlistScope.js';

/**
 * Load playlist by id and assert SIGNAGE access. Sends JSON error on failure.
 * @returns {Promise<object|null>} playlist row or null if response already sent
 */
export async function loadSignagePlaylistWithAccess(req, res, prisma, playlistId, sourceRoute) {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: {
      items: {
        include: { asset: true, media: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (!playlist) {
    res.status(404).json({
      ok: false,
      error: 'not_found',
      message: 'Playlist not found',
    });
    return null;
  }

  const access = await assertSignagePlaylistAccess(playlist, req, prisma, { sourceRoute });
  if (!access.ok) {
    res.status(access.status).json({
      ok: false,
      error: access.error,
      message: access.message,
    });
    return null;
  }

  return access.playlist;
}

export { resolvePlaylistScopeFromRequest };
