/**
 * crmPromptBuilder.js
 * Builds the user-turn prompt for the CRM agent.
 * Reads from stepOutputs: content_creator, activate_promotion, create_promotion,
 * analyze_store, market_research.
 */

/**
 * @param {object} params
 * @param {string} params.missionRunId
 * @param {string} params.goal
 * @param {object} params.stepOutputs
 * @returns {string}
 */
export function buildCrmPrompt({ missionRunId, goal, stepOutputs }) {
  const contentPlan = stepOutputs?.content_creator?.output?.contentPlan ?? null;
  const activation = stepOutputs?.activate_promotion?.output ?? stepOutputs?.activate_promotion ?? null;
  const promotion = stepOutputs?.create_promotion?.output ?? stepOutputs?.create_promotion ?? null;
  const storeAnalysis = stepOutputs?.analyze_store?.output ?? stepOutputs?.analyze_store ?? null;
  const marketReport = stepOutputs?.market_research?.marketReport ?? null;

  const storeName = storeAnalysis?.storeName ?? 'the store';
  const productCount = storeAnalysis?.productCount ?? 0;
  const campaignTitle = contentPlan?.campaignTitle ?? promotion?.title ?? 'Campaign';
  const promoDiscount = promotion?.discountValue != null
    ? `${promotion.discountValue}${promotion.discountType === 'percent' ? '%' : '$'} off`
    : 'special offer';
  const campaignId = activation?.campaignId ?? activation?.id ?? null;
  const location = marketReport?.location
    ? [marketReport.location.suburb, marketReport.location.state, marketReport.location.country].filter(Boolean).join(', ')
    : 'Australia';
  const demographics = marketReport?.audienceProfile?.demographics ?? 'General AU retail';
  const peakDays = (marketReport?.audienceProfile?.peakDays ?? []).join(', ') || 'weekends';

  // Simulate realistic interaction signals based on campaign context.
  // In production these would come from real customer interaction data.
  const channels = ['instagram', 'facebook', 'email'];
  const channelList = channels.join(', ');

  return `
## Mission context
Mission run ID: ${missionRunId}
Goal: ${goal}

## Store
- Name: ${storeName}
- Location: ${location}
- Products: ${productCount}

## Campaign just launched
- Title: ${campaignTitle}
- Offer: ${promoDiscount}
${campaignId ? `- Campaign ID: ${campaignId}` : ''}
- Channels: ${channelList}

## Audience
- Demographics: ${demographics}
- Peak engagement days: ${peakDays}

## Your task
The campaign "${campaignTitle}" has just gone live for ${storeName}.
Based on this campaign context, generate a realistic LeadLog representing
the initial customer interactions this campaign would receive.

Include 3–5 lead entries covering a mix of:
- Purchase intent (someone ready to buy)
- Product inquiry (questions about the offer)
- General inquiry (asking about store hours, location, etc.)
- At least 1 entry flagged for owner follow-up

For each entry:
- customerId: null (new leads don't have IDs yet)
- customerName: realistic AU first name + last initial, or null
- intent: 'purchase' | 'inquiry' | 'complaint' | 'other'
- message: realistic customer message referencing the campaign
- channel: one of instagram, facebook, email
- autoReplied: true only for clear purchase intents or standard inquiries
- flaggedForOwner: true for complaints and high-value purchase intents
- createdAt: ISO 8601 timestamp within the last hour

Set:
- totalInquiries: count of entries with intent 'inquiry' or 'purchase'
- conversionRate: null (too early to measure)

Respond ONLY with valid JSON LeadLog:
{
  "missionRunId": "${missionRunId}",
  "entries": [...],
  "totalInquiries": <number>,
  "conversionRate": null
}
`.trim();
}

