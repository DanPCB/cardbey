/**
 * Append-only publishing audit events.
 */

import { getPrismaClient } from '../../prisma.js';
import { logCreatorContentTelemetry } from '../creatorContentTelemetry.js';

/**
 * @param {object} input
 */
export async function appendPublishingEvent(input) {
  const prisma = getPrismaClient();
  const row = await prisma.creatorPublishingEvent.create({
    data: {
      contentId: input.contentId,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorType: input.actorType ?? 'system',
      actorId: input.actorId ?? null,
      metadataJson: input.metadata ?? null,
    },
  });

  logCreatorContentTelemetry(input.eventType, {
    source: 'creator_publishing_center',
    contentId: input.contentId,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorType: input.actorType ?? 'system',
    actorId: input.actorId ?? null,
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
  });

  return row;
}

/**
 * @param {string} contentId
 * @param {number} [limit]
 */
export async function listPublishingEvents(contentId, limit = 50) {
  const prisma = getPrismaClient();
  return prisma.creatorPublishingEvent.findMany({
    where: { contentId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });
}

export default { appendPublishingEvent, listPublishingEvents };
