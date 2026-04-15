/**
 * Promotion signal summary — reusable reader for promotion entities.
 * Uses IntentSignal model; supports offer_view, page_view, qr_scan, cta_click, redeem (future-ready; missing = 0).
 */

const VIEW_TYPES = ['offer_view', 'page_view'];

/**
 * Normalized promotion signal summary for a store and optional offer.
 * @param {object} prisma - PrismaClient
 * @param {string} storeId - Store (Business) id
 * @param {string|null} [offerId=null] - If set, filter signals to this offer
 * @param {number} [windowDays=7] - Days to look back
 * @returns {Promise<{ views: number, qrScans: number, ctaClicks: number, redeems: number, windowDays: number }>}
 */
export async function getPromotionSignalSummary(prisma, storeId, offerId = null, windowDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const where = { storeId, createdAt: { gte: since } };
  if (offerId) where.offerId = offerId;

  const signals = await prisma.intentSignal.findMany({
    where,
    select: { type: true },
  });

  let views = 0;
  let qrScans = 0;
  let ctaClicks = 0;
  let redeems = 0;

  for (const s of signals) {
    if (VIEW_TYPES.includes(s.type)) views++;
    else if (s.type === 'qr_scan') qrScans++;
    else if (s.type === 'cta_click') ctaClicks++;
    else if (s.type === 'redeem') redeems++;
  }

  return { views, qrScans, ctaClicks, redeems, windowDays };
}
