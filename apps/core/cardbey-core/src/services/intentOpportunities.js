/**
 * IntentOpportunity v0: compute opportunities from IntentSignal metrics.
 * Called on demand (e.g. when GET /api/stores/:storeId/opportunities).
 * Does not execute; opportunities are accepted into Mission Inbox as IntentRequests (single runway).
 * Promotion entity mode: payload includes entityType, source for mission hook wiring.
 * Store entity mode: store-level opportunities use entityType: 'store', source: 'store_opportunity'.
 */

const VIEW_TYPES = ['offer_view', 'page_view'];

/** Store-level opportunity payload for mission hook (entityType, source). */
function storePayload(base) {
  return { ...base, entityType: 'store', source: 'store_opportunity' };
}

/**
 * Compute opportunities for a store over a time window and persist open ones (no duplicate type+offerId).
 * @param {object} prisma - PrismaClient
 * @param {string} storeId - Store (Business) id
 * @param {number} [windowDays=7] - Days to look back
 * @returns {Promise<{ created: number, opportunities: object[] }>}
 */
export async function computeOpportunities(prisma, storeId, windowDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const signals = await prisma.intentSignal.findMany({
    where: { storeId, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });

  const viewsByOffer = new Map(); // offerId -> count (null = store-level views without offer)
  let storeViews = 0;
  let storeQrScans = 0;
  let recent24h = 0;
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  for (const s of signals) {
    const isView = VIEW_TYPES.includes(s.type);
    const isQr = s.type === 'qr_scan';
    if (isView) {
      storeViews++;
      const key = s.offerId || null;
      viewsByOffer.set(key, (viewsByOffer.get(key) || 0) + 1);
    }
    if (isQr) storeQrScans++;
    if (s.createdAt >= oneDayAgo) recent24h++;
  }

  const allOffers = await prisma.storeOffer.findMany({
    where: { storeId },
    select: { id: true, slug: true, title: true, isActive: true, endsAt: true },
  });
  const offers = allOffers.filter((o) => o.isActive === true);
  const now = new Date();

  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, publishedAt: true },
  });
  const isPublished = business?.publishedAt != null;

  const candidates = [];

  // 1) high_views_no_qr: offer has views but no QR scans -> suggest create_qr_for_offer
  const qrScansByOffer = new Map();
  for (const s of signals) {
    if (s.type === 'qr_scan' && s.offerId) {
      qrScansByOffer.set(s.offerId, (qrScansByOffer.get(s.offerId) || 0) + 1);
    }
  }
  // Helper: enrich payload for mission hook (entityType, source)
  const promotionPayload = (base) => ({
    ...base,
    entityType: 'promotion',
    source: 'promotion_opportunity',
  });

  for (const offer of offers) {
    const viewCount = viewsByOffer.get(offer.id) || 0;
    const qrCount = qrScansByOffer.get(offer.id) || 0;
    const offerName = (offer.title && String(offer.title).trim()) || undefined;
    if (viewCount >= 2 && qrCount === 0) {
      candidates.push({
        storeId,
        offerId: offer.id,
        type: 'high_views_no_qr',
        severity: viewCount >= 5 ? 'high' : 'medium',
        summary: `"${offer.title}" has ${viewCount} views but no QR scans. Add a QR code to capture in-person traffic.`,
        evidence: { viewCount, qrCount, windowDays },
        recommendedIntentType: 'create_qr_for_offer',
        payload: promotionPayload({ offerId: offer.id, offerName }),
      });
    }
    // low_conversion: traffic exists but weak follow-through (views vs qr scans)
    if (viewCount >= 4 && qrCount >= 1 && qrCount < Math.ceil(viewCount * 0.25)) {
      candidates.push({
        storeId,
        offerId: offer.id,
        type: 'low_conversion',
        severity: 'medium',
        summary: `"${offer.title}" has ${viewCount} views but few scans. Improve copy or publish your feed to boost conversion.`,
        evidence: { viewCount, qrCount, windowDays },
        recommendedIntentType: 'improve_promotion_copy',
        payload: promotionPayload({ offerId: offer.id, offerName }),
      });
    }
  }

  // expired_still_traffic: offer inactive/expired but still receiving views
  for (const offer of allOffers) {
    const expired = offer.endsAt && new Date(offer.endsAt) < now;
    const inactive = offer.isActive === false;
    if (!expired && !inactive) continue;
    const viewCount = viewsByOffer.get(offer.id) || 0;
    if (viewCount < 1) continue;
    const offerName = (offer.title && String(offer.title).trim()) || undefined;
    candidates.push({
      storeId,
      offerId: offer.id,
      type: 'expired_still_traffic',
      severity: viewCount >= 3 ? 'high' : 'medium',
      summary: `"${offer.title}" is no longer active but still has traffic. Launch a follow-up offer.`,
      evidence: { viewCount, windowDays },
      recommendedIntentType: 'launch_followup_offer',
      payload: promotionPayload({ offerId: offer.id, offerName }),
    });
  }

  // Store-level opportunities (entityType: 'store', source: 'store_opportunity')
  const totalSignals = storeViews + storeQrScans;

  // no_first_offer: store exists but has no active offers
  if (offers.length === 0) {
    candidates.push({
      storeId,
      offerId: null,
      type: 'no_first_offer',
      severity: 'high',
      summary: 'Launch your first offer to start capturing intent.',
      evidence: { windowDays },
      recommendedIntentType: 'create_offer',
      payload: storePayload({ storeId }),
    });
  }

  // low_store_traffic: store has very few signals (threshold: 3)
  if (totalSignals < 3) {
    const hasOffers = offers.length > 0;
    candidates.push({
      storeId,
      offerId: null,
      type: 'low_store_traffic',
      severity: 'medium',
      summary: hasOffers
        ? `Only ${totalSignals} visits in the last ${windowDays} days. Improve store visibility.`
        : `No offer yet. Launch your first offer to grow traffic.`,
      evidence: { storeViews, storeQrScans, totalSignals, windowDays },
      recommendedIntentType: hasOffers ? 'publish_intent_feed' : 'create_offer',
      payload: storePayload({ storeId }),
    });
  }

  // high_preview_no_publish: draft/preview interest but store not published
  if (!isPublished && (storeViews > 0 || recent24h > 0)) {
    candidates.push({
      storeId,
      offerId: null,
      type: 'high_preview_no_publish',
      severity: storeViews >= 3 ? 'high' : 'medium',
      summary: 'You have preview interest. Prepare this store to publish.',
      evidence: { storeViews, recent24h, windowDays },
      recommendedIntentType: 'prepare_to_publish',
      payload: storePayload({ storeId }),
    });
  }

  // published_no_distribution: store is published but little/no feed/QR/offer activity
  if (isPublished && totalSignals < 5) {
    const hasOffers = offers.length > 0;
    candidates.push({
      storeId,
      offerId: null,
      type: 'published_no_distribution',
      severity: 'medium',
      summary: hasOffers
        ? 'Publish your intent feed to reach more people.'
        : 'Launch your first offer to get distribution.',
      evidence: { storeViews, storeQrScans, totalSignals, windowDays },
      recommendedIntentType: hasOffers ? 'publish_intent_feed' : 'create_offer',
      payload: storePayload({ storeId }),
    });
  }

  // recent_interest: activity in last 24h -> suggest capitalize
  if (recent24h >= 1 && recent24h <= 10) {
    candidates.push({
      storeId,
      offerId: null,
      type: 'recent_interest',
      severity: 'low',
      summary: `${recent24h} visit(s) in the last 24 hours. Make sure your offer page and QR are easy to find.`,
      evidence: { recent24h, windowDays },
      recommendedIntentType: 'publish_intent_feed',
      payload: storePayload({ storeId }),
    });
  }

  let created = 0;
  for (const c of candidates) {
    const existing = await prisma.intentOpportunity.findFirst({
      where: {
        storeId,
        type: c.type,
        offerId: c.offerId ?? null,
        status: 'open',
      },
    });
    if (!existing) {
      await prisma.intentOpportunity.create({
        data: {
          storeId: c.storeId,
          offerId: c.offerId,
          type: c.type,
          severity: c.severity,
          status: 'open',
          summary: c.summary,
          evidence: c.evidence,
          recommendedIntentType: c.recommendedIntentType,
          payload: c.payload,
          source: 'rules',
        },
      });
      created++;
    }
  }

  const opportunities = await prisma.intentOpportunity.findMany({
    where: { storeId, status: 'open' },
    orderBy: { createdAt: 'desc' },
  });

  return { created, opportunities };
}
