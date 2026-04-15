/**
 * Score store products against Step 1 market research output.
 * Returns top N products ranked by relevance to the campaign.
 * Uses topProductsToPromote + audienceProfile when present (report v2); falls back to text signals.
 */

import { getPrismaClient } from '../lib/prisma.js';

/**
 * @param {string} storeId
 * @param {object} marketReport - from Step 1 output
 * @param {number} topN
 * @returns {Promise<Array<{
 *   productId: string,
 *   name: string,
 *   price: number|null,
 *   category: string|null,
 *   imageUrl: string|null,
 *   score: number,
 *   reason: string,
 * }>>}
 */
export async function scoreProductsForCampaign(storeId, marketReport = {}, topN = 3) {
  const prisma = getPrismaClient();

  const products = await prisma.product.findMany({
    where: {
      businessId: storeId,
      isPublished: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      price: true,
      category: true,
      imageUrl: true,
      images: true,
      description: true,
    },
    take: 50,
  });

  if (!products.length) return [];

  const topRaw = Array.isArray(marketReport?.topProductsToPromote) ? marketReport.topProductsToPromote : [];
  const hasTopPicks = topRaw.length > 0;
  const topById = new Map();
  const topByName = new Map();
  topRaw.forEach((t, idx) => {
    if (!t || typeof t !== 'object') return;
    const pid = String(t.productId ?? '').trim();
    const pname = String(t.productName ?? '').trim().toLowerCase();
    const reason = String(t.reason ?? '').trim();
    if (pid) topById.set(pid, { rank: idx, reason });
    if (pname) topByName.set(pname, { rank: idx, reason });
  });

  const ap =
    marketReport?.audienceProfile && typeof marketReport.audienceProfile === 'object'
      ? marketReport.audienceProfile
      : {};
  const pricePoint = String(ap.pricePoint ?? '').toLowerCase().trim();
  const primarySegment = String(ap.primarySegment ?? '').trim();

  const reportText = JSON.stringify(marketReport).toLowerCase();
  const insights = Array.isArray(marketReport?.insights)
    ? marketReport.insights.join(' ').toLowerCase()
    : '';
  const recommendations = Array.isArray(marketReport?.recommendations)
    ? marketReport.recommendations.join(' ').toLowerCase()
    : '';
  const summary = String(marketReport?.summary ?? '').toLowerCase();
  const targetAudienceText = String(marketReport?.targetAudience ?? '').toLowerCase();
  const combinedSignals = `${reportText} ${insights} ${recommendations} ${summary} ${targetAudienceText}`;

  const scored = products.map((product) => {
    let score = 0;
    const name = (product.name ?? '').toLowerCase();
    const category = (product.category ?? '').toLowerCase();
    const description = (product.description ?? '').toLowerCase();

    const topPick = topById.get(product.id) ?? topByName.get((product.name ?? '').trim().toLowerCase());
    if (hasTopPicks && topPick) {
      const rankBoost = topPick.rank === 0 ? 6 : topPick.rank === 1 ? 4 : 2;
      score += rankBoost;
    }

    if (combinedSignals.includes(name)) score += 3;
    if (category && combinedSignals.includes(category)) score += 2;

    const hasImage = !!(product.imageUrl || (Array.isArray(product.images) && product.images.length));
    if (hasImage) score += 2;

    const price = product.price;
    if (price != null && price > 0) score += 1;

    if (description.length > 20) score += 1;

    if (price != null && Number.isFinite(price) && pricePoint) {
      if (pricePoint === 'budget' && price <= 40) score += 2;
      else if (pricePoint === 'mid-range' && price > 12 && price < 100) score += 2;
      else if (pricePoint === 'premium' && price >= 35) score += 2;
    }

    const legacyReasons = [];
    if (category && combinedSignals.includes(category)) {
      legacyReasons.push(`${category} matches target audience`);
    }
    if (hasImage) legacyReasons.push('has product image');
    if (price != null && price > 0) {
      legacyReasons.push(`priced at $${price}`);
    }

    /** Prefer LLM reason when this product appears in topProductsToPromote. */
    let reason;
    if (hasTopPicks && topPick && String(topPick.reason ?? '').trim()) {
      reason = String(topPick.reason).trim();
    } else {
      reason = legacyReasons.length ? legacyReasons.join(', ') : 'available in store catalog';
    }

    if (marketReport?.audienceProfile && primarySegment) {
      const seg = primarySegment.length > 90 ? `${primarySegment.slice(0, 87)}…` : primarySegment;
      reason = `${reason} · ${seg}`;
    }

    let imageUrl = product.imageUrl ?? null;
    if (!imageUrl && Array.isArray(product.images) && product.images.length) {
      const first = product.images[0];
      imageUrl = typeof first === 'string' ? first : first?.url ?? null;
    }

    return {
      productId: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      imageUrl,
      score,
      reason,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}
