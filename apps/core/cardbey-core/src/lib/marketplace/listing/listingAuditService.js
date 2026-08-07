import { getPrismaClient } from '../../prisma.js';
import { logMarketplaceTelemetry } from '../telemetry.js';

export async function appendMarketplaceListingEvent(input, prisma = getPrismaClient()) {
  const row = await prisma.marketplaceListingEvent.create({
    data: {
      listingId: input.listingId,
      eventType: input.eventType,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      reason: input.reason ?? null,
      metadataJson: input.metadata ?? null,
    },
  });

  logMarketplaceTelemetry(input.eventType, {
    listingId: input.listingId,
    previousStatus: input.previousStatus ?? null,
    newStatus: input.newStatus ?? null,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    reason: input.reason ?? null,
  });

  return row;
}
