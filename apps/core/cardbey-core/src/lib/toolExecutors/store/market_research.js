/**
 * Tool: market_research.
 * Store-grounded catalog + structured LLM market intelligence.
 * create_promotion resolves: stepOut.campaign_research?.marketReport ?? stepOut.market_research?.marketReport
 * — output MUST include output.marketReport (nested object).
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { llmGateway } from '../../../lib/llm/llmGateway.ts';

const SYSTEM_PROMPT =
  'You are a marketing strategist. Return raw JSON only. No markdown, no preamble, no explanation.';

function stripJsonFences(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return t;
}

function formatLocation(store) {
  const parts = [store?.address, store?.suburb, store?.postcode, store?.country].filter(
    (p) => p != null && String(p).trim(),
  );
  return parts.length ? parts.map((p) => String(p).trim()).join(', ') : '';
}

function formatProductLine(p) {
  const cat = p.category != null && String(p.category).trim() ? String(p.category).trim() : 'uncategorized';
  const priceLabel =
    p.price != null && Number.isFinite(Number(p.price)) ? `$${p.price}` : '$—';
  return `- ${p.name} | ${cat} | ${priceLabel}`;
}

/**
 * Normalize LLM JSON into the contract returned inside output.marketReport.
 * @param {object} parsed
 * @param {{ storeId: string, storeName: string, productCount: number }} meta
 */
function buildMarketReport(parsed, meta) {
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

  const targetAudience = String(parsed?.targetAudience ?? audienceProfile.primarySegment).trim();
  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations.map((x) => String(x)).filter(Boolean).slice(0, 8)
    : [];

  return {
    storeId,
    storeName,
    productCount,
    topProductsToPromote,
    audienceProfile,
    marketContext,
    targetAudience,
    recommendations,
    generatedAt: new Date().toISOString(),
    /** Consensus voter prompt branch (store-grounded report). */
    reportVersion: 2,
  };
}

/**
 * @param {object} input
 * @param {object} context
 */
export async function execute(input = {}, context = {}) {
  const rawStore = input?.storeId ?? context?.storeId;
  const storeId =
    typeof rawStore === 'string' ? rawStore.trim() : rawStore != null ? String(rawStore).trim() : '';

  const tenantKey = context?.tenantId ?? context?.tenantKey ?? 'default';

  const priorStepsContext =
    typeof input?.priorStepsContext === 'string' && input.priorStepsContext.trim()
      ? input.priorStepsContext.trim()
      : '';

  const rawCampaignContext =
    typeof input?.campaignContext === 'string' && input.campaignContext.trim().length > 50
      ? input.campaignContext.trim()
      : '';

  const intentOverrideMode = Boolean(rawCampaignContext);

  console.log('[market_research] mode:', intentOverrideMode ? 'INTENT_OVERRIDE' : 'STORE_GROUNDED');
  console.log(
    '[market_research] campaignContext:',
    rawCampaignContext ? 'PRESENT len=' + rawCampaignContext.length : 'NONE',
    priorStepsContext ? 'prior len=' + priorStepsContext.length : '',
  );

  const start = Date.now();
  const prisma = getPrismaClient();

  try {
    // ── Store context (always load for brand/location, even in intent mode) ──
    let store = null;
    let products = [];

    if (storeId) {
      [store, products] = await Promise.all([
        prisma.business.findUnique({
          where: { id: storeId },
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            address: true,
            suburb: true,
            postcode: true,
            country: true,
            region: true,
          },
        }),
        intentOverrideMode
          ? Promise.resolve([]) // Skip product query when primary campaign text is from upload/intent
          : prisma.product.findMany({
              where: { businessId: storeId, isPublished: true, deletedAt: null },
              select: { id: true, name: true, category: true, price: true, description: true },
              orderBy: { createdAt: 'desc' },
              take: 20,
            }),
      ]);
    }

    const storeName = store?.name ?? 'Your Business';
    const industry =
      store?.type != null && String(store.type).trim() ? String(store.type).trim() : 'Not specified';
    const location = store ? formatLocation(store) || 'Not specified' : 'Not specified';

    // ── Build prompt based on mode ──
    let userPrompt;

    if (intentOverrideMode) {
      // INTENT OVERRIDE MODE: uploaded / intent campaign text is the primary source
      const primaryBlock = rawCampaignContext.slice(0, 2000);
      const priorBlock = priorStepsContext
        ? `\n\nEarlier mission steps (continuity — align with this where relevant):\n${priorStepsContext.slice(0, 1500)}`
        : '';
      userPrompt = `${SYSTEM_PROMPT}

Business: ${storeName}
Industry: ${industry}
Location: ${location}

Campaign Content (PRIMARY SOURCE - base your entire analysis on this):
${primaryBlock}${priorBlock}

You are analyzing the above campaign content to generate a marketing intelligence report.
The business information above provides brand context only.

Return JSON with exactly these fields:
{
  "topProductsToPromote": [],
  "audienceProfile": {
    "primarySegment": "describe the target audience based on the campaign content",
    "interests": ["interest1", "interest2"],
    "buyingMotivation": "what motivates this audience based on the campaign",
    "pricePoint": "budget | mid-range | premium"
  },
  "marketContext": {
    "categoryTrend": "market trend relevant to the campaign content",
    "seasonalOpportunity": "seasonal angle from the campaign content",
    "competitorLandscape": "competitive context for this type of campaign",
    "recommendedCampaignAngle": "best angle to promote based on the campaign content"
  },
  "targetAudience": "1-2 sentence description of the ideal audience for this campaign",
  "recommendations": [
    "recommendation 1 based on campaign content",
    "recommendation 2 based on campaign content",
    "recommendation 3 based on campaign content"
  ]
}

CRITICAL: topProductsToPromote must be [] since this is based on uploaded campaign content, not store products.
Base ALL fields on the campaign content provided above. Do not default to generic retail or fashion insights.`.trim();
    } else {
      // STORE GROUNDED MODE: existing behavior
      const productBlock =
        products.length > 0
          ? products.map((p) => formatProductLine(p)).join('\n')
          : '(none — infer from store profile only)';

      const description =
        store?.description != null && String(store.description).trim()
          ? String(store.description).trim()
          : 'Not provided';

      userPrompt = `${SYSTEM_PROMPT}

Store: ${storeName}
Industry: ${industry}
Description: ${description}
Location: ${location}

Products (${products.length}):
${productBlock}

Return JSON with exactly these fields:
{
  "topProductsToPromote": [
    {
      "productId": "string",
      "productName": "string",
      "category": "string",
      "price": number,
      "reason": "1 sentence why this product is best to promote"
    }
  ],
  "audienceProfile": {
    "primarySegment": "string",
    "interests": ["string"],
    "buyingMotivation": "string",
    "pricePoint": "budget | mid-range | premium"
  },
  "marketContext": {
    "categoryTrend": "string",
    "seasonalOpportunity": "string",
    "competitorLandscape": "string",
    "recommendedCampaignAngle": "string"
  },
  "targetAudience": "string",
  "recommendations": ["string", "string", "string"]
}

Use up to 3 items in topProductsToPromote (best first). If there are no products, use [].`.trim();

      if (priorStepsContext) {
        userPrompt += `\n\nEarlier mission steps (continuity):\n${priorStepsContext.slice(0, 2000)}`;
      }
    }

    const llmResult = await llmGateway.generate({
      purpose: 'market_research_store_intelligence',
      prompt: userPrompt,
      model: process.env.AGENT_LLM_MODEL ?? undefined,
      provider: process.env.AGENT_LLM_PROVIDER ?? undefined,
      tenantKey,
      maxTokens: 1800,
      temperature: 0.35,
      responseFormat: 'json',
    });

    const raw = stripJsonFences(llmResult?.text ?? '');
    let parsed;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      console.error('[market_research] LLM invalid JSON, raw (truncated):', raw.slice(0, 2000));
      throw new Error('market_research: LLM returned invalid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('market_research: LLM returned invalid JSON');
    }

    const marketReport = buildMarketReport(parsed, {
      storeId: storeId || 'intent_override',
      storeName,
      productCount: products.length,
    });

    // Attach campaignContext flag for downstream tools
    if (intentOverrideMode) {
      marketReport.intentOverride = true;
      marketReport.campaignContextSummary = rawCampaignContext.slice(0, 200);
    }

    return {
      status: 'ok',
      output: {
        marketReport,
        durationMs: Date.now() - start,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== 'production') {
      console.error('[market_research]', message);
    }
    const code = message.startsWith('Store not found for storeId:')
      ? 'STORE_NOT_FOUND'
      : message === 'market_research: LLM returned invalid JSON'
        ? 'MARKET_RESEARCH_INVALID_JSON'
        : 'MARKET_RESEARCH_FAILED';
    return {
      status: 'failed',
      error: { code, message },
      output: { durationMs: Date.now() - start },
    };
  }
}
