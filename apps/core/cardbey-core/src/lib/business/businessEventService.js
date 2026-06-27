/**
 * Immutable commercial event log — permanent business history.
 */

import { BUSINESS_EVENT_TYPES } from './constants.js';

export { BUSINESS_EVENT_TYPES };

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} data
 */
export async function appendBusinessEvent(prisma, data) {
  const {
    storeId,
    eventType,
    aggregateType = null,
    aggregateId = null,
    payload = {},
    actorUserId = null,
    runtimeExecutionId = null,
    missionId = null,
  } = data;

  if (!prisma?.businessEvent?.create) {
    return { id: null, persisted: false, eventType, payload };
  }

  const row = await prisma.businessEvent.create({
    data: {
      storeId,
      eventType,
      aggregateType,
      aggregateId,
      payload,
      actorUserId,
      runtimeExecutionId,
      missionId,
    },
  });

  return { id: row.id, persisted: true, eventType, createdAt: row.createdAt };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {object} [filters]
 */
export async function listBusinessEvents(prisma, storeId, filters = {}) {
  const { eventType, aggregateType, aggregateId, limit = 50 } = filters;
  if (!prisma?.businessEvent?.findMany) return [];

  return prisma.businessEvent.findMany({
    where: {
      storeId,
      ...(eventType ? { eventType } : {}),
      ...(aggregateType ? { aggregateType } : {}),
      ...(aggregateId ? { aggregateId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, limit)),
  });
}
