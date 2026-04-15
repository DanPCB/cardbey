/**
 * Studio Suggested Experiments
 * 
 * Helper functions for generating structured experiment suggestions
 * for content studio activity reports.
 */

import { buildInsightAction } from "../../utils/insightActionBuilder.js";

/**
 * Build structured suggested experiments for Content Studio Activity
 * reports when activity is low / zero.
 * 
 * @param params - Parameters for building experiments
 * @param params.tenantId - Tenant ID
 * @returns Array of insight objects with actions
 */
export function buildLowActivitySuggestedExperiments(params) {
  const { tenantId } = params;

  const insights = [];

  // 1) Engagement Campaign
  insights.push({
    id: "studio_exp_engagement",
    title: "Engagement Campaign",
    body:
      "Launch a campaign encouraging team members to explore design tools and create new content.",
    action: buildInsightAction({
      description:
        "Launch an internal engagement campaign to activate your team in the studio.",
      entryPoint: "studio_engagement_campaign",
      payload: {
        tenantId,
        goal: "activate_team",
        suggestedDurationDays: 14,
      },
      navigation: {
        href: "/dashboard/campaigns/new?type=engagement",
        label: "Launch Campaign",
      },
      source: "report",
      priority: "primary",
    }),
  });

  // 2) Training Sessions
  insights.push({
    id: "studio_exp_training",
    title: "Training Sessions",
    body:
      "Organize a training session or workshop on how to use the content studio effectively.",
    action: buildInsightAction({
      description:
        "Generate a training plan and agenda to onboard your team to the content studio.",
      entryPoint: "studio_training_guide",
      payload: {
        tenantId,
        audience: "staff",
        durationMinutes: 60,
      },
      navigation: {
        href: "/dashboard/studio/training",
        label: "Training & Guides",
      },
      source: "report",
    }),
  });

  // 3) Set Goals
  insights.push({
    id: "studio_exp_goals",
    title: "Set Goals",
    body:
      "Establish clear goals for content creation and editing to motivate participation for upcoming periods.",
    action: buildInsightAction({
      description:
        "Set monthly content creation goals for your team in the studio.",
      entryPoint: "studio_goal_planner",
      payload: {
        tenantId,
        timeFrame: "monthly",
        metrics: ["new_designs", "published_assets"],
      },
      navigation: {
        href: "/dashboard/studio/goals",
        label: "Set Goals",
      },
      source: "report",
    }),
  });

  // 4) Content Calendar
  insights.push({
    id: "studio_exp_calendar",
    title: "Content Calendar",
    body:
      "Implement a content calendar to plan and schedule content creation activities.",
    action: buildInsightAction({
      description:
        "Build a 30-day content calendar for upcoming campaigns and studio assets.",
      entryPoint: "content_calendar_builder",
      payload: {
        tenantId,
        timeFrameDays: 30,
        channels: ["cnet", "social", "in_app"],
      },
      navigation: {
        href: "/dashboard/studio/calendar",
        label: "Open Calendar",
      },
      source: "report",
    }),
  });

  return insights;
}

