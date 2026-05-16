/**
 * Store-level signal summary — reusable reader for store entities.
 * Uses IntentSignal; supports store_view (page_view/offer_view), qr_scan, cta_click, publish (future).
 */

const VIEW_TYPES = ['offer_view', 'page_view'];

/**
 * Normalized store signal summary for a store over a time window.
 * @param {object} prisma - PrismaClient
 * @param {string} storeId - Store (Business) id
 * @param {number} [windowDays=7] - Days to look back
 * @returns {Promise<{ storeViews: number, offerViews: number, qrScans: number, ctaClicks: number, publishes: number, windowDays: number }>}
 */
export async function getStoreSignalSummary(prisma, storeId, windowDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const signals = await prisma.intentSignal.findMany({
    where: { storeId, createdAt: { gte: since } },
    select: { type: true, offerId: true },
  });

  let storeViews = 0;
  let offerViews = 0;
  let qrScans = 0;
  let ctaClicks = 0;
  let publishes = 0;

  for (const s of signals) {
    if (VIEW_TYPES.includes(s.type)) {
      storeViews++;
      if (s.offerId) offerViews++;
    }
    if (s.type === 'qr_scan') qrScans++;
    if (s.type === 'cta_click') ctaClicks++;
    if (s.type === 'publish') publishes++;
  }

  return {
    storeViews,
    offerViews,
    qrScans,
    ctaClicks,
    publishes,
    windowDays,
  };
}
