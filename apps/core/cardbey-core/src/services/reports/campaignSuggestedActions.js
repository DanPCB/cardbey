/**
 * Campaign Suggested Actions
 * 
 * Helper functions for generating structured action suggestions
 * for campaign performance reports.
 */

import { buildInsightAction } from "../../utils/insightActionBuilder.js";

/**
 * Build suggested actions for campaign performance reports
 * 
 * @param params - Parameters for building actions
 * @param params.tenantId - Tenant ID
 * @param params.campaignId - Optional campaign ID (if focusing on a specific campaign)
 * @returns Array of insight objects with actions
 */
export function buildCampaignSuggestedActions(params) {
  const { tenantId, campaignId } = params;
  const cid = campaignId ?? undefined;

  const insights = [];

  // 1) High-level strategy review
  insights.push({
    id: `cmp_sugg_strategy_${cid ?? "all"}`,
    title: "Review Campaign Strategy",
    body:
      "Analyze recent campaign performance to understand what is working and where results can be improved.",
    action: buildInsightAction({
      description: "Ask Cardbey to review your overall campaign strategy.",
      entryPoint: "campaign_strategy_review",
      payload: {
        tenantId,
        lookbackDays: 30,
        limit: 10,
        campaignId: cid,
      },
      navigation: {
        href: "/dashboard/reports/campaigns",
        label: "Open Campaign Reports",
      },
      source: "report",
      priority: "primary",
    }),
  });

  // 2) Screen / device distribution optimization
  insights.push({
    id: `cmp_sugg_screendistribution_${cid ?? "all"}`,
    title: "Optimize Screen Distribution",
    body:
      "Reallocate impressions or budget toward the best-performing screens and away from underperforming ones.",
    action: buildInsightAction({
      description: "Let Cardbey suggest a better screen distribution.",
      entryPoint: "screen_distribution_optimizer",
      payload: {
        tenantId,
        campaignId: cid,
        objective: "reach",
      },
      navigation: {
        href: "/dashboard/insights/screens",
        label: "Analyze Screens",
      },
      source: "report",
      priority: "secondary",
    }),
  });

  // 3) Targeting refinement
  insights.push({
    id: `cmp_sugg_targeting_${cid ?? "all"}`,
    title: "Refine Campaign Targeting",
    body:
      "Adjust targeting by devices, locations, or time slots based on performance trends.",
    action: buildInsightAction({
      description: "Ask Cardbey to propose improved targeting.",
      entryPoint: "campaign_targeting_planner",
      payload: {
        tenantId,
        baseCampaignId: cid,
        goal: "awareness",
      },
      navigation: {
        href: "/dashboard/campaigns/new",
        label: "Create Campaign",
      },
      source: "report",
      priority: "secondary",
    }),
  });

  // 4) A/B test suggestion
  insights.push({
    id: `cmp_sugg_ab_${cid ?? "all"}`,
    title: "Run an A/B Test",
    body:
      "Test different creatives, screen groups, or time windows to improve engagement and conversion.",
    action: buildInsightAction({
      description: "Have Cardbey propose an A/B test setup.",
      entryPoint: "campaign_ab_suggester",
      payload: {
        tenantId,
        campaignId: cid,
        variants: 2,
      },
      navigation: {
        href: "/dashboard/campaigns/ab-test",
        label: "A/B Testing",
      },
      source: "report",
      priority: "secondary",
    }),
  });

  // 5) Review cadence scheduling
  insights.push({
    id: `cmp_sugg_review_${cid ?? "all"}`,
    title: "Schedule Regular Reviews",
    body:
      "Set a recurring review cadence to keep campaigns monitored and optimized over time.",
    action: buildInsightAction({
      description: "Ask Cardbey to recommend a review schedule.",
      entryPoint: "campaign_review_scheduler",
      payload: {
        tenantId,
        cadence: "weekly",
        dayOfWeek: 1,
      },
      navigation: {
        href: "/dashboard/insights/performance",
        label: "Performance Overview",
      },
      source: "report",
      priority: "secondary",
    }),
  });

  return insights;
}

