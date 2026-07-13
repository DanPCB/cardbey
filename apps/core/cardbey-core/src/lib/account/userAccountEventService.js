/**
 * Append-only user account audit events.
 */

import { getPrismaClient } from '../prisma.js';

/**
 * @param {object} input
 */
export async function appendUserAccountEvent(input) {
  const prisma = getPrismaClient();
  return prisma.userAccountEvent.create({
    data: {
      userId: input.userId,
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? input.actorType ?? null,
      reasonCode: input.reasonCode ?? null,
      publicReason: input.publicReason ?? null,
      internalNote: input.internalNote ?? null,
      previousStateJson: input.previousState ?? null,
      nextStateJson: input.nextState ?? null,
      requestId: input.requestId ?? null,
    },
  });
}

/**
 * @param {string} userId
 * @param {number} [limit]
 */
export async function listUserAccountEvents(userId, limit = 50) {
  const prisma = getPrismaClient();
  return prisma.userAccountEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });
}

export default { appendUserAccountEvent, listUserAccountEvents };
