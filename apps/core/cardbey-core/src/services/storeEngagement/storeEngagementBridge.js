/**
 * Bridge legacy writers → canonical StoreActivityEvent pipeline.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function bridgeQrScanToStoreEngagement(prisma, input) {
  const { recordStoreEngagementEvent } = await import('./storeEngagementEventService.js');
  return recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'QR_SCANNED',
    source: input.source ?? 'qr',
    sessionId: input.sessionId ?? null,
    metadata: {
      offerId: input.offerId ?? null,
      code: input.code ?? null,
    },
    entityType: 'qr',
    entityId: input.code ?? null,
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function bridgeOfferViewToStoreEngagement(prisma, input) {
  const { recordStoreEngagementEvent } = await import('./storeEngagementEventService.js');
  return recordStoreEngagementEvent(prisma, {
    storeId: input.storeId,
    eventType: 'OFFER_VIEWED',
    source: input.source ?? 'offer',
    sessionId: input.sessionId ?? null,
    metadata: { offerId: input.offerId ?? null },
    entityType: 'offer',
    entityId: input.offerId ?? null,
  });
}

/**
 * Bridge content interaction writes to store-level engagement when storeId is known.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function bridgeContentInteractionToStoreEngagement(prisma, input) {
  const storeId = input.storeId || (input.contentType === 'store' ? input.contentId : null);
  if (!storeId) return null;

  const { recordStoreView, toggleStoreLike, recordStoreShare } = await import(
    './storeEngagementActionService.js'
  );

  const ctx = {
    storeId,
    viewerKey: input.viewerKey,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? input.viewerKey ?? null,
    source: input.source ?? 'content_interaction',
  };

  if (input.action === 'view') return recordStoreView(prisma, ctx);
  if (input.action === 'love_on') return toggleStoreLike(prisma, { ...ctx, forceLike: true });
  if (input.action === 'love_off') return toggleStoreLike(prisma, ctx);
  if (input.action === 'share') return recordStoreShare(prisma, ctx);
  return null;
}
