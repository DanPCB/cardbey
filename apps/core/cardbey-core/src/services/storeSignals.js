/**
 * Store-level signal summary — canonical StoreActivityEvent reader with IntentSignal fallback.
 */

const VIEW_EVENT_TYPES = ['STORE_VIEWED', 'OFFER_VIEWED'];
const LEGACY_VIEW_TYPES = ['offer_view', 'page_view'];

/**
 * @param {object} prisma - PrismaClient
 * @param {string} storeId
 * @param {number} [windowDays=7]
 */
export async function getStoreSignalSummary(prisma, storeId, windowDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const [events, legacySignals, snapshot] = await Promise.all([
    prisma.storeActivityEvent.findMany({
      where: { storeId, createdAt: { gte: since } },
      select: { eventType: true, metadataJson: true },
    }),
    prisma.intentSignal.findMany({
      where: { storeId, createdAt: { gte: since } },
      select: { type: true, offerId: true },
    }),
    prisma.storeEngagementSnapshot.findUnique({ where: { storeId } }),
  ]);

  let storeViews = 0;
  let offerViews = 0;
  let qrScans = 0;
  let ctaClicks = 0;
  let publishes = 0;

  if (events.length > 0) {
    for (const e of events) {
      if (VIEW_EVENT_TYPES.includes(e.eventType)) {
        storeViews++;
        if (e.eventType === 'OFFER_VIEWED' || e.metadataJson?.offerId) offerViews++;
      }
      if (e.eventType === 'QR_SCANNED') qrScans++;
      if (['ORDER_CLICKED', 'CALL_CLICKED', 'MESSAGE_CLICKED', 'WEBSITE_CLICKED', 'MAP_CLICKED'].includes(e.eventType)) {
        ctaClicks++;
      }
      if (e.eventType === 'CAMPAIGN_OPENED') publishes++;
    }
  } else {
    for (const s of legacySignals) {
      if (LEGACY_VIEW_TYPES.includes(s.type)) {
        storeViews++;
        if (s.offerId) offerViews++;
      }
      if (s.type === 'qr_scan') qrScans++;
      if (s.type === 'cta_click') ctaClicks++;
      if (s.type === 'publish') publishes++;
    }
  }

  return {
    storeViews: snapshot?.views7d ?? storeViews,
    offerViews: snapshot?.offerClaimsCount ?? offerViews,
    qrScans: snapshot?.qrScansCount ?? qrScans,
    ctaClicks: snapshot?.orderClicksCount ?? ctaClicks,
    publishes,
    engagementScore: snapshot?.engagementScore ?? 0,
    windowDays,
  };
}
