import { getPrismaClient } from '../../prisma.js';
import { logMarketplaceTelemetry } from '../telemetry.js';

export async function appendMarketplaceSellerStatusEvent(input, prisma = getPrismaClient()) {
  const row = await prisma.marketplaceSellerStatusEvent.create({
    data: {
      sellerId: input.sellerId,
      eventType: input.eventType,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      reason: input.reason ?? null,
      metadataJson: input.metadata ?? null,
    },
  });

  logMarketplaceTelemetry(input.eventType, {
    sellerId: input.sellerId,
    previousStatus: input.previousStatus ?? null,
    newStatus: input.newStatus,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    reason: input.reason ?? null,
  });

  return row;
}
