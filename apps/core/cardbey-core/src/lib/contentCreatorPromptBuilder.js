/**
 * contentCreatorPromptBuilder.js
 *
 * Field paths match the actual MarketReport shape in contracts/index.ts:
 * - marketReport.location (suburb/state/country/timezone)
 * - marketReport.seasonalFactors[]
 * - marketReport.audienceProfile.{demographics, peakDays}
 */

function resolveLocation(marketReport) {
  if (!marketReport?.location) return 'Australia';
  const { suburb, state, country } = marketReport.location;
  if (suburb && state) return `${suburb}, ${state}, ${country ?? 'AU'}`;
  if (state) return `${state}, ${country ?? 'AU'}`;
  return country ?? 'Australia';
}

function resolvePromoDetails(promotion) {
  const title = promotion?.output?.title ?? promotion?.title ?? 'Current Promotion';
  const value = promotion?.output?.discountValue ?? promotion?.discountValue;
  const type = promotion?.output?.discountType ?? promotion?.discountType;
  const discount = value != null
    ? `${value}${type === 'percent' ? '%' : '$'} off`
    : 'special offer';
  const endsAt = promotion?.output?.endsAt ?? promotion?.endsAt ?? 'soon';
  return { title, discount, endsAt };
}

export function buildContentCreatorPrompt({
  goal, marketReport, consensusDecision, storeAnalysis, promotion, activation,
}) {
  const storeName = storeAnalysis?.output?.storeName ?? storeAnalysis?.storeName ?? 'the store';
  const storeType = storeAnalysis?.output?.storeType ?? storeAnalysis?.storeType ?? 'retail';
  const productCount = storeAnalysis?.output?.productCount ?? 0;
  const publishStatus = storeAnalysis?.output?.publishStatus ?? 'unknown';
  const location = resolveLocation(marketReport);
  const { title: promoTitle, discount: promoDiscount, endsAt: promoEndDate } = resolvePromoDetails(promotion);
  const campaignId = activation?.output?.campaignId ?? activation?.campaignId ?? null;
  const seasonalFactors = (marketReport?.seasonalFactors ?? []).map((f) => `- ${f}`).join('\n') || '- No seasonal factors';
  const demographics = marketReport?.audienceProfile?.demographics ?? 'General AU retail audience';
  const peakDays = (marketReport?.audienceProfile?.peakDays ?? []).join(', ') || 'weekends';
  const recommendedDiscount = marketReport?.recommendedDiscount ?? null;
  const pricingBenchmark = marketReport?.pricingBenchmark
    ? `AUD $${marketReport.pricingBenchmark.low}–$${marketReport.pricingBenchmark.high}`
    : 'market rate';
  const competitors = (marketReport?.competitors ?? []).slice(0, 2)
    .map((c) => `- ${c.name} (${c.promotionFrequency} promo frequency)`).join('\n') || '- No competitor data';
  const consensusSummary = consensusDecision?.summary ?? `Decision: ${consensusDecision?.recommendedAction ?? 'launch_promotion'}`;

  return `
## Campaign brief
Goal: ${goal}

## Store
- Name: ${storeName}
- Type: ${storeType}
- Location: ${location}
- Products: ${productCount}
- Status: ${publishStatus}

## Active promotion
- Title: ${promoTitle}
- Offer: ${promoDiscount}
- Valid until: ${promoEndDate}
${campaignId ? `- Campaign ID: ${campaignId}` : ''}
${recommendedDiscount != null ? `- Market recommended discount: ${recommendedDiscount}%` : ''}

## Market context
- Demographics: ${demographics}
- Peak days: ${peakDays}
- Pricing benchmark: ${pricingBenchmark}
- Competitors: ${competitors}
- Seasonal factors: ${seasonalFactors}

## Consensus
${consensusSummary}

## Your task
Generate a ContentPlan with three social posts (Instagram, Facebook, TikTok), one email campaign, and promotional copy.
All content must reference "${storeName}", include the offer (${promoDiscount}), use AU spelling.

Respond ONLY with valid JSON ContentPlan:
{
  "generatedAt": "<ISO 8601>",
  "storeName": "${storeName}",
  "campaignTitle": "<campaign title>",
  "social": {
    "posts": [
      { "platform": "instagram", "copy": "...", "hashtags": ["..."], "visualNote": "..." },
      { "platform": "facebook", "copy": "...", "hashtags": ["..."] },
      { "platform": "tiktok", "copy": "...", "hashtags": ["..."] }
    ]
  },
  "emailAndPromo": {
    "email": { "subjectLine": "...", "previewText": "...", "bodyHtml": "...", "ctaText": "..." },
    "promo": { "headline": "...", "subheadline": "...", "terms": "...", "badgeText": "..." }
  },
  "summary": "<1-2 sentences>"
}
`.trim();
}

export function buildSocialPrompt({ storeName, promoTitle, promoDiscount, location, seasonalFactors, peakDays }) {
  return `
## Store: ${storeName} (${location})
## Promotion: ${promoTitle} — ${promoDiscount}
## Peak days: ${(peakDays ?? []).join(', ') || 'weekends'}
## Seasonal context: ${(seasonalFactors ?? []).slice(0, 2).join(', ') || 'current season'}

Write three social posts. Instagram: visual+emotional, 1-3 hashtags + visualNote. Facebook: community CTA, 1-2 hashtags. TikTok: energetic hook first 3 words, 2-3 hashtags. AU spelling, under 150 words each.

Respond ONLY with valid JSON:
{ "posts": [
  { "platform": "instagram", "copy": "...", "hashtags": ["..."], "visualNote": "..." },
  { "platform": "facebook", "copy": "...", "hashtags": ["..."] },
  { "platform": "tiktok", "copy": "...", "hashtags": ["..."] }
]}
`.trim();
}

export function buildEmailAndPromoPrompt({ storeName, promoTitle, promoDiscount, promoEndDate, location, demographics, pricingBenchmark }) {
  return `
## Store: ${storeName} (${location})
## Audience: ${demographics ?? 'General AU retail customers'}
## Pricing benchmark: ${pricingBenchmark ?? 'market rate'}
## Promotion: ${promoTitle} — ${promoDiscount}, ends ${promoEndDate}

Write an email campaign (subject, preview, HTML body under 100 words, CTA) and promotional display copy (headline, subheadline, terms, badge). AU spelling, warm but conversion-focused.

Respond ONLY with valid JSON:
{ "email": { "subjectLine": "...", "previewText": "...", "bodyHtml": "...", "ctaText": "..." },
  "promo": { "headline": "...", "subheadline": "...", "terms": "...", "badgeText": "..." } }
`.trim();
}
