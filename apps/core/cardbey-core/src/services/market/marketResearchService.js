/**
 * Market research service — competitor discovery + structured report enrichment.
 * Used by tool executor store/market_research.js (single LLM call, store-grounded).
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, type?: string | null, suburb?: string | null, region?: string | null }} store
 */
export async function findPublishedCompetitors(prisma, store) {
  if (!store?.id) return [];

  const category = store.type != null && String(store.type).trim() ? String(store.type).trim() : null;
  const suburb = store.suburb != null && String(store.suburb).trim() ? String(store.suburb).trim() : null;

  /** @type {import('@prisma/client').Prisma.BusinessWhereInput} */
  const where = {
    id: { not: store.id },
    publishedAt: { not: null },
  };

  if (category) where.type = category;
  if (suburb) where.suburb = suburb;

  const rows = await prisma.business.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      suburb: true,
      region: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    category: r.type ?? null,
    suburb: r.suburb ?? null,
    region: r.region ?? null,
  }));
}

/**
 * @param {object[]} competitors
 */
export function formatCompetitorBlock(competitors) {
  if (!competitors.length) return '(no published competitors in the same category/area)';
  return competitors
    .map((c) => {
      const loc = [c.suburb, c.region].filter(Boolean).join(', ') || 'location unknown';
      const desc = c.description ? String(c.description).slice(0, 120) : 'no description';
      return `- ${c.name} (${loc}): ${desc}`;
    })
    .join('\n');
}

/**
 * @param {object} parsed — LLM JSON
 * @param {object} meta
 * @param {object[]} directCompetitors
 */
export function enrichMarketReport(parsed, meta, directCompetitors = []) {
  const { storeId, storeName, productCount } = meta;
  const top = Array.isArray(parsed?.topProductsToPromote) ? parsed.topProductsToPromote : [];
  const topProductsToPromote = top
    .slice(0, 3)
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const productId = String(row.productId ?? '').trim();
      const productName = String(row.productName ?? '').trim();
      const category = row.category != null ? String(row.category) : '';
      const price = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null;
      const reason = String(row.reason ?? '').trim() || 'Strong fit to promote now';
      if (!productId && !productName) return null;
      return { productId, productName, category, price, reason };
    })
    .filter(Boolean);

  const ap = parsed?.audienceProfile && typeof parsed.audienceProfile === 'object' ? parsed.audienceProfile : {};
  const audienceProfile = {
    primarySegment: String(ap.primarySegment ?? '').trim() || 'General local shoppers',
    interests: Array.isArray(ap.interests)
      ? ap.interests.map((x) => String(x)).filter(Boolean).slice(0, 8)
      : [],
    buyingMotivation: String(ap.buyingMotivation ?? '').trim() || '',
    pricePoint: ['budget', 'mid-range', 'premium'].includes(String(ap.pricePoint).toLowerCase().trim())
      ? String(ap.pricePoint).toLowerCase().trim()
      : 'mid-range',
  };

  const mc = parsed?.marketContext && typeof parsed.marketContext === 'object' ? parsed.marketContext : {};
  const marketContext = {
    categoryTrend: String(mc.categoryTrend ?? '').trim(),
    seasonalOpportunity: String(mc.seasonalOpportunity ?? '').trim(),
    competitorLandscape: String(mc.competitorLandscape ?? '').trim(),
    recommendedCampaignAngle: String(mc.recommendedCampaignAngle ?? '').trim(),
  };

  const ca = parsed?.competitorAnalysis && typeof parsed.competitorAnalysis === 'object' ? parsed.competitorAnalysis : {};
  const competitorAnalysis = {
    summary: String(ca.summary ?? mc.competitorLandscape ?? '').trim(),
    strengths: Array.isArray(ca.strengths) ? ca.strengths.map((s) => String(s)).filter(Boolean).slice(0, 6) : [],
    weaknesses: Array.isArray(ca.weaknesses) ? ca.weaknesses.map((s) => String(s)).filter(Boolean).slice(0, 6) : [],
    positioning: String(ca.positioning ?? '').trim(),
    uniqueOpportunities: Array.isArray(ca.uniqueOpportunities)
      ? ca.uniqueOpportunities.map((s) => String(s)).filter(Boolean).slice(0, 6)
      : [],
  };

  const tr = parsed?.trends && typeof parsed.trends === 'object' ? parsed.trends : {};
  const trends = {
    consumer: String(tr.consumer ?? '').trim(),
    technology: String(tr.technology ?? '').trim(),
    marketing: String(tr.marketing ?? '').trim(),
    competitiveLandscape: String(tr.competitiveLandscape ?? mc.categoryTrend ?? '').trim(),
    sources: ['store_catalog', 'competitor_index', 'llm_analysis'],
  };

  const op = parsed?.opportunities && typeof parsed.opportunities === 'object' ? parsed.opportunities : {};
  const opportunities = {
    marketGaps: Array.isArray(op.marketGaps) ? op.marketGaps.map((s) => String(s)).filter(Boolean).slice(0, 6) : [],
    underservedSegments: Array.isArray(op.underservedSegments)
      ? op.underservedSegments.map((s) => String(s)).filter(Boolean).slice(0, 6)
      : [],
    pricingOpportunities: Array.isArray(op.pricingOpportunities)
      ? op.pricingOpportunities.map((s) => String(s)).filter(Boolean).slice(0, 6)
      : [],
    productOpportunities: Array.isArray(op.productOpportunities)
      ? op.productOpportunities.map((s) => String(s)).filter(Boolean).slice(0, 6)
      : [],
    confidence: typeof op.confidence === 'number' ? op.confidence : 0.75,
  };

  const rawRecs = Array.isArray(parsed?.actionableRecommendations) ? parsed.actionableRecommendations : [];
  const actionableRecommendations = rawRecs
    .slice(0, 5)
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const action = String(row.action ?? '').trim();
      if (!action) return null;
      const effort = ['low', 'medium', 'high'].includes(String(row.effort ?? '').toLowerCase())
        ? String(row.effort).toLowerCase()
        : 'medium';
      const priority = ['low', 'medium', 'high'].includes(String(row.priority ?? '').toLowerCase())
        ? String(row.priority).toLowerCase()
        : 'medium';
      return {
        category: String(row.category ?? 'marketing').trim() || 'marketing',
        action,
        expectedImpact: String(row.expectedImpact ?? row.impact ?? '').trim() || 'Improved campaign performance',
        effort,
        priority,
      };
    })
    .filter(Boolean);

  const targetAudience = String(parsed?.targetAudience ?? audienceProfile.primarySegment).trim();
  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations.map((x) => String(x)).filter(Boolean).slice(0, 8)
    : actionableRecommendations.map((r) => r.action).slice(0, 8);

  return {
    storeId,
    storeName,
    productCount,
    topProductsToPromote,
    audienceProfile,
    marketContext,
    competitors: {
      directCompetitors,
      count: directCompetitors.length,
      analysis: competitorAnalysis,
    },
    trends,
    opportunities,
    actionableRecommendations,
    targetAudience,
    recommendations,
    generatedAt: new Date().toISOString(),
    reportVersion: 3,
  };
}

export const EXTENDED_RESEARCH_JSON_SCHEMA = `
  "competitorAnalysis": {
    "summary": "string — competitive overview",
    "strengths": ["string"],
    "weaknesses": ["string"],
    "positioning": "string — how this store can differentiate",
    "uniqueOpportunities": ["string"]
  },
  "trends": {
    "consumer": "string — consumer behavior trends",
    "technology": "string — relevant technology trends",
    "marketing": "string — marketing trends",
    "competitiveLandscape": "string"
  },
  "opportunities": {
    "marketGaps": ["string"],
    "underservedSegments": ["string"],
    "pricingOpportunities": ["string"],
    "productOpportunities": ["string"],
    "confidence": 0.0
  },
  "actionableRecommendations": [
    {
      "category": "product | marketing | pricing",
      "action": "string",
      "expectedImpact": "string",
      "effort": "low | medium | high",
      "priority": "high | medium | low"
    }
  ],
`;
