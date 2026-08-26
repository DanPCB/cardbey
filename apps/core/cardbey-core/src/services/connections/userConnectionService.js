/**
 * User↔user connection graph (friend / connect requests).
 * Separate from StoreFollow and contact-sync matching.
 */

const PROFILE_SELECT = Object.freeze({
  id: true,
  handle: true,
  displayName: true,
  fullName: true,
  avatarUrl: true,
  tagline: true,
});

const STATUSES = new Set(['pending', 'accepted', 'rejected', 'blocked']);

export function publicUserProfile(user) {
  if (!user) return null;
  return {
    id: user.id,
    handle: user.handle ?? null,
    displayName: user.displayName ?? null,
    fullName: user.fullName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    tagline: user.tagline ?? null,
  };
}

export function serializeConnection(row) {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    suggestionId: row.suggestionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    respondedAt: row.respondedAt ?? null,
    fromUser: publicUserProfile(row.fromUser),
    toUser: publicUserProfile(row.toUser),
  };
}

/**
 * Find any connection edge between two users (either direction).
 */
export async function findConnectionBetween(prisma, userAId, userBId) {
  if (!userAId || !userBId) return null;
  return prisma.userConnection.findFirst({
    where: {
      OR: [
        { fromUserId: userAId, toUserId: userBId },
        { fromUserId: userBId, toUserId: userAId },
      ],
    },
    include: {
      fromUser: { select: PROFILE_SELECT },
      toUser: { select: PROFILE_SELECT },
    },
  });
}

/**
 * Map peerUserId → connection status for the viewer (accepted wins; else pending if involving viewer).
 * @returns {Promise<Map<string, string|null>>}
 */
export async function connectionStatusByPeerIds(prisma, viewerId, peerIds) {
  const map = new Map();
  const unique = Array.from(new Set((peerIds || []).filter(Boolean)));
  for (const id of unique) map.set(id, null);
  if (!viewerId || !unique.length) return map;

  const rows = await prisma.userConnection.findMany({
    where: {
      OR: [
        { fromUserId: viewerId, toUserId: { in: unique } },
        { toUserId: viewerId, fromUserId: { in: unique } },
      ],
      status: { in: ['pending', 'accepted', 'blocked'] },
    },
    select: { fromUserId: true, toUserId: true, status: true },
  });

  for (const row of rows) {
    const peer = row.fromUserId === viewerId ? row.toUserId : row.fromUserId;
    const prev = map.get(peer);
    if (row.status === 'accepted' || !prev) {
      map.set(peer, row.status);
    } else if (row.status === 'blocked') {
      map.set(peer, 'blocked');
    } else if (prev !== 'accepted' && prev !== 'blocked') {
      map.set(peer, row.status);
    }
  }
  return map;
}

/**
 * Create a pending connection request.
 */
export async function createConnectionRequest(prisma, {
  fromUserId,
  toUserId,
  suggestionId = null,
  source = 'direct',
}) {
  if (!fromUserId || !toUserId) {
    return { ok: false, code: 'BAD_REQUEST', status: 400, message: 'toUserId required' };
  }
  if (fromUserId === toUserId) {
    return { ok: false, code: 'SELF_CONNECT', status: 400, message: 'Cannot connect to yourself' };
  }

  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true },
  });
  if (!target) {
    return { ok: false, code: 'NOT_FOUND', status: 404, message: 'User not found' };
  }

  const existing = await findConnectionBetween(prisma, fromUserId, toUserId);
  if (existing) {
    if (existing.status === 'accepted') {
      return { ok: true, connection: existing, created: false, code: 'ALREADY_CONNECTED' };
    }
    if (existing.status === 'pending') {
      return { ok: true, connection: existing, created: false, code: 'ALREADY_PENDING' };
    }
    if (existing.status === 'blocked') {
      return { ok: false, code: 'BLOCKED', status: 403, message: 'Connection not allowed' };
    }
    // rejected: allow re-request by updating directed edge from requester
    if (existing.fromUserId === fromUserId) {
      const updated = await prisma.userConnection.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          source: source === 'contact_suggestion' ? 'contact_suggestion' : 'direct',
          suggestionId: suggestionId || null,
          respondedAt: null,
        },
        include: {
          fromUser: { select: PROFILE_SELECT },
          toUser: { select: PROFILE_SELECT },
        },
      });
      return { ok: true, connection: updated, created: true };
    }
  }

  const safeSource = source === 'contact_suggestion' ? 'contact_suggestion' : 'direct';
  const created = await prisma.userConnection.create({
    data: {
      fromUserId,
      toUserId,
      status: 'pending',
      source: safeSource,
      suggestionId: suggestionId || null,
    },
    include: {
      fromUser: { select: PROFILE_SELECT },
      toUser: { select: PROFILE_SELECT },
    },
  });

  if (suggestionId) {
    await prisma.contactSuggestion.updateMany({
      where: { id: suggestionId, userId: fromUserId, status: 'active' },
      data: { status: 'acted' },
    }).catch(() => {});
  }

  return { ok: true, connection: created, created: true };
}

export async function respondToConnection(prisma, {
  connectionId,
  actorUserId,
  action, // accept | reject
}) {
  const row = await prisma.userConnection.findUnique({
    where: { id: connectionId },
    include: {
      fromUser: { select: PROFILE_SELECT },
      toUser: { select: PROFILE_SELECT },
    },
  });
  if (!row) {
    return { ok: false, code: 'NOT_FOUND', status: 404, message: 'Connection not found' };
  }
  if (row.toUserId !== actorUserId) {
    return { ok: false, code: 'FORBIDDEN', status: 403, message: 'Only the recipient can respond' };
  }
  if (row.status !== 'pending') {
    return { ok: false, code: 'INVALID_STATE', status: 409, message: 'Connection is not pending' };
  }

  const status = action === 'accept' ? 'accepted' : 'rejected';
  const updated = await prisma.userConnection.update({
    where: { id: connectionId },
    data: { status, respondedAt: new Date() },
    include: {
      fromUser: { select: PROFILE_SELECT },
      toUser: { select: PROFILE_SELECT },
    },
  });
  return { ok: true, connection: updated };
}

export async function deleteConnection(prisma, { connectionId, actorUserId }) {
  const row = await prisma.userConnection.findUnique({ where: { id: connectionId } });
  if (!row) {
    return { ok: false, code: 'NOT_FOUND', status: 404, message: 'Connection not found' };
  }
  if (row.fromUserId !== actorUserId && row.toUserId !== actorUserId) {
    return { ok: false, code: 'FORBIDDEN', status: 403, message: 'Not allowed' };
  }
  await prisma.userConnection.delete({ where: { id: connectionId } });
  return { ok: true };
}

export async function listConnections(prisma, {
  userId,
  status,
  direction = 'mutual',
  take = 100,
}) {
  const where = {};
  if (status && STATUSES.has(status)) {
    where.status = status;
  }

  if (direction === 'incoming') {
    where.toUserId = userId;
  } else if (direction === 'outgoing') {
    where.fromUserId = userId;
  } else {
    where.OR = [{ fromUserId: userId }, { toUserId: userId }];
  }

  const rows = await prisma.userConnection.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(Number(take) || 100, 1), 200),
    include: {
      fromUser: { select: PROFILE_SELECT },
      toUser: { select: PROFILE_SELECT },
    },
  });
  return rows;
}

/**
 * Import accepted friendships from a legacy id map (Phase C).
 * @param {Array<{ fromUserId: string, toUserId: string }>} pairs — already mapped to new user ids
 */
export async function importLegacyAcceptedConnections(prisma, pairs, { dryRun = false } = {}) {
  const stats = { received: 0, created: 0, skipped: 0, errors: 0 };
  const seen = new Set();

  for (const pair of pairs || []) {
    stats.received += 1;
    const a = typeof pair?.fromUserId === 'string' ? pair.fromUserId.trim() : '';
    const b = typeof pair?.toUserId === 'string' ? pair.toUserId.trim() : '';
    if (!a || !b || a === b) {
      stats.skipped += 1;
      continue;
    }
    const key = [a, b].sort().join(':');
    if (seen.has(key)) {
      stats.skipped += 1;
      continue;
    }
    seen.add(key);

    try {
      const existing = await findConnectionBetween(prisma, a, b);
      if (existing?.status === 'accepted') {
        stats.skipped += 1;
        continue;
      }
      if (dryRun) {
        stats.created += 1;
        continue;
      }
      if (existing) {
        await prisma.userConnection.update({
          where: { id: existing.id },
          data: {
            status: 'accepted',
            source: 'legacy_import',
            respondedAt: new Date(),
          },
        });
      } else {
        await prisma.userConnection.create({
          data: {
            fromUserId: a,
            toUserId: b,
            status: 'accepted',
            source: 'legacy_import',
            respondedAt: new Date(),
          },
        });
      }
      stats.created += 1;
    } catch {
      stats.errors += 1;
    }
  }

  return stats;
}
