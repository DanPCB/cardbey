/**
 * contentCreatorEngine.js
 *
 * Step 5 — Content Creator
 *
 * Reads from all prior stepOutputs, fans out to two specialist agents in parallel
 * (social media + email/promo), assembles into a ContentPlan, and validates with Zod.
 *
 * Pipeline position: after activate_promotion
 *
 * stepOutputs consumed:
 *   market_research.marketReport
 *   consensus.consensusDecision
 *   analyze_store  (storeId, storeName, storeType, productCount, publishStatus, summary)
 *   create_promotion (title, discountValue, discountType, startsAt, endsAt)
 *   activate_promotion (campaignId, status)
 */

import { callAsAgent } from './agents/agentRegistry.js';
import { buildSocialPrompt, buildEmailAndPromoPrompt } from './contentCreatorPromptBuilder.js';
import { assertSocialPostSet, assertEmailAndPromoCopy, assertContentPlan } from './agents/contentCreatorValidator.js';

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.goal
 * @param {object} params.stepOutputs        Full stepOutputs from pipeline context
 * @param {string} params.tenantKey
 * @returns {Promise<{ generatedAt: string, storeName: string, campaignTitle: string, social: object, emailAndPromo: object, summary: string }>}
 */
export async function runContentCreator({ goal, stepOutputs, tenantKey }) {
  // ── Extract upstream outputs ───────────────────────────────────────────────
  const marketReport = stepOutputs?.market_research?.marketReport ?? null;
  const consensusDecision = stepOutputs?.consensus?.consensusDecision ?? null;
  const storeAnalysis = stepOutputs?.analyze_store ?? null;
  const promotion = stepOutputs?.create_promotion ?? null;
  const activation = stepOutputs?.activate_promotion ?? null;

  // ── Resolve shared context fields ─────────────────────────────────────────
  const storeName = storeAnalysis?.output?.storeName
    ?? storeAnalysis?.storeName
    ?? 'the store';

  const location = (() => {
    if (!marketReport?.location) return 'Australia';
    const { suburb, state, country } = marketReport.location;
    if (suburb && state) return `${suburb}, ${state}, ${country ?? 'AU'}`;
    if (state) return `${state}, ${country ?? 'AU'}`;
    return country ?? 'Australia';
  })();

  const promoTitle = promotion?.output?.title
    ?? promotion?.title
    ?? 'Current Promotion';

  const promoDiscount = promotion?.output?.discountValue != null
    ? `${promotion.output.discountValue}${promotion.output.discountType === 'percent' ? '%' : '$'} off`
    : 'special offer';

  const promoEndDate = promotion?.output?.endsAt
    ?? promotion?.endsAt
    ?? 'soon';

  const seasonalFactors = marketReport?.seasonalFactors ?? [];
  const peakDays = marketReport?.audienceProfile?.peakDays ?? [];
  const demographics = marketReport?.audienceProfile?.demographics ?? 'General AU retail';
  const pricingBenchmark = marketReport?.pricingBenchmark
    ? `AUD $${marketReport.pricingBenchmark.low}–$${marketReport.pricingBenchmark.high}`
    : 'market rate';

  // ── Fan out to specialists in parallel ────────────────────────────────────
  const [socialRaw, emailRaw] = await Promise.all([
    callAsAgent(
      'content_creator_social',
      buildSocialPrompt({ storeName, promoTitle, promoDiscount, location, seasonalFactors, peakDays }),
      { tenantId: tenantKey },
    ),
    callAsAgent(
      'content_creator_email',
      buildEmailAndPromoPrompt({ storeName, promoTitle, promoDiscount, promoEndDate, location, demographics, pricingBenchmark }),
      { tenantId: tenantKey },
    ),
  ]);

  // ── Validate specialist outputs ───────────────────────────────────────────
  const social = assertSocialPostSet(socialRaw);
  const emailAndPromo = assertEmailAndPromoCopy(emailRaw);

  // ── Assemble ContentPlan ──────────────────────────────────────────────────
  const plan = {
    generatedAt: new Date().toISOString(),
    storeName,
    campaignTitle: promoTitle,
    social,
    emailAndPromo,
    summary: `Generated ${social.posts.length} social posts and 1 email campaign for "${promoTitle}" (${promoDiscount}) targeting ${location}.`,
  };

  // ── Validate final ContentPlan ────────────────────────────────────────────
  return assertContentPlan(plan);
}
