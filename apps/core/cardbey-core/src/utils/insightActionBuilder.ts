/**
 * Insight Action Builder
 * 
 * Utilities for building standardized InsightAction objects.
 */

import { InsightAction, InsightActionNavigation, OrchestratorEntryPoint, InsightSource } from "../types/insights.js";
import { randomUUID } from "crypto";

/**
 * Get navigation link for an entry point
 */
export function navigationFor(entryPoint: OrchestratorEntryPoint): InsightActionNavigation {
  switch (entryPoint) {
    case "device_health_check":
    case "playlist_assignment_audit":
    case "device_monitoring_review":
      return { href: "/dashboard/devices/health", label: "Open Devices" };

    case "device_maintenance_plan":
      return { href: "/dashboard/devices/maintenance", label: "Maintenance" };

    case "device_alert_setup_heartbeats":
      return { href: "/dashboard/settings/alerts?tab=device", label: "Alert Settings" };

    case "campaign_strategy_review":
      return { href: "/dashboard/reports/campaigns", label: "Campaign Reports" };

    case "screen_distribution_optimizer":
      return { href: "/dashboard/insights/screens", label: "Analyze Screens" };

    case "campaign_targeting_planner":
      return { href: "/dashboard/campaigns/new", label: "Create Campaign" };

    case "campaign_ab_suggester":
      return { href: "/dashboard/campaigns/ab-test", label: "A/B Testing" };

    case "campaign_review_scheduler":
      return { href: "/dashboard/insights/performance", label: "Performance Overview" };

    case "studio_engagement_campaign":
      return { href: "/dashboard/campaigns/new?type=engagement", label: "Launch Campaign" };

    case "studio_training_guide":
      return { href: "/dashboard/studio/training", label: "Training Guides" };

    case "studio_goal_planner":
      return { href: "/dashboard/studio/goals", label: "Set Goals" };

    case "content_calendar_builder":
      return { href: "/dashboard/studio/calendar", label: "Open Calendar" };

    default:
      return { href: "/dashboard", label: "Open Dashboard" };
  }
}

/**
 * Build an InsightAction object
 */
export function buildInsightAction(params: {
  description: string;
  entryPoint: OrchestratorEntryPoint;
  payload: Record<string, any>;
  navigation?: InsightActionNavigation;
  source?: InsightSource;
  priority?: "primary" | "secondary";
}): InsightAction {
  return {
    id: "act_" + randomUUID(),
    description: params.description,
    entryPoint: params.entryPoint,
    payload: params.payload,
    navigation: params.navigation ?? navigationFor(params.entryPoint),
    source: params.source ?? "insight_card",
    priority: params.priority ?? "primary",
  };
}

/**
 * Infer entry point from insight tags and content
 * 
 * This helper analyzes insight tags and content to suggest the most appropriate
 * orchestrator entry point for the action.
 */
export function inferEntryPointFromInsight(
  tags: string | null | undefined,
  kind: string | null | undefined,
  title: string,
  summaryMd: string
): OrchestratorEntryPoint | null {
  const tagStr = (tags || "").toLowerCase();
  const kindStr = (kind || "").toLowerCase();
  const titleLower = title.toLowerCase();
  const summaryLower = summaryMd.toLowerCase();

  // Device-related insights
  if (
    tagStr.includes("device") ||
    tagStr.includes("heartbeat") ||
    tagStr.includes("uptime") ||
    titleLower.includes("device") ||
    titleLower.includes("offline") ||
    summaryLower.includes("device") ||
    summaryLower.includes("heartbeat")
  ) {
    if (tagStr.includes("health") || titleLower.includes("health")) {
      return "device_health_check";
    }
    if (tagStr.includes("playlist") || titleLower.includes("playlist") || titleLower.includes("assignment")) {
      return "playlist_assignment_audit";
    }
    if (tagStr.includes("maintenance") || titleLower.includes("maintenance")) {
      return "device_maintenance_plan";
    }
    if (tagStr.includes("alert") || titleLower.includes("alert")) {
      return "device_alert_setup_heartbeats";
    }
    return "device_monitoring_review";
  }

  // Campaign-related insights
  if (
    tagStr.includes("campaign") ||
    kindStr.includes("campaign") ||
    titleLower.includes("campaign") ||
    summaryLower.includes("campaign")
  ) {
    if (tagStr.includes("strategy") || titleLower.includes("strategy") || titleLower.includes("review")) {
      return "campaign_strategy_review";
    }
    if (tagStr.includes("screen") || tagStr.includes("distribution") || titleLower.includes("screen")) {
      return "screen_distribution_optimizer";
    }
    if (tagStr.includes("targeting") || titleLower.includes("targeting")) {
      return "campaign_targeting_planner";
    }
    if (tagStr.includes("ab") || tagStr.includes("test") || titleLower.includes("a/b")) {
      return "campaign_ab_suggester";
    }
    if (tagStr.includes("schedule") || titleLower.includes("schedule")) {
      return "campaign_review_scheduler";
    }
    return "campaign_strategy_review";
  }

  // Studio/content-related insights
  if (
    tagStr.includes("studio") ||
    tagStr.includes("content") ||
    tagStr.includes("design") ||
    kindStr.includes("studio") ||
    titleLower.includes("studio") ||
    titleLower.includes("content")
  ) {
    if (tagStr.includes("engagement") || titleLower.includes("engagement")) {
      return "studio_engagement_campaign";
    }
    if (tagStr.includes("training") || titleLower.includes("training")) {
      return "studio_training_guide";
    }
    if (tagStr.includes("goal") || titleLower.includes("goal")) {
      return "studio_goal_planner";
    }
    if (tagStr.includes("calendar") || titleLower.includes("calendar")) {
      return "content_calendar_builder";
    }
    return "studio_engagement_campaign";
  }

  // Default fallback based on kind
  if (kindStr.includes("device")) {
    return "device_health_check";
  }
  if (kindStr.includes("campaign")) {
    return "campaign_strategy_review";
  }
  if (kindStr.includes("studio") || kindStr.includes("content")) {
    return "studio_engagement_campaign";
  }

  return null;
}

/**
 * Build payload for an entry point based on insight context
 */
export function buildPayloadForEntryPoint(
  entryPoint: OrchestratorEntryPoint,
  tenantId: string,
  context: {
    deviceId?: string;
    storeId?: string;
    campaignId?: string;
    kind?: string;
    [key: string]: any;
  }
): Record<string, any> {
  const basePayload: Record<string, any> = { tenantId };

  switch (entryPoint) {
    case "device_health_check":
      return {
        ...basePayload,
        scope: context.deviceId ? "device" : context.storeId ? "store" : "tenant",
        deviceId: context.deviceId,
        storeId: context.storeId,
        lookbackMinutes: 60,
      };

    case "playlist_assignment_audit":
      return {
        ...basePayload,
        deviceId: context.deviceId,
        storeId: context.storeId,
        windowHours: 24,
      };

    case "device_maintenance_plan":
      return {
        ...basePayload,
        deviceId: context.deviceId || "",
        frequencyDays: 14,
        createCalendarEvents: false,
      };

    case "device_alert_setup_heartbeats":
      return {
        ...basePayload,
        deviceIds: context.deviceId ? [context.deviceId] : undefined,
        offlineThresholdMinutes: 10,
        channels: ["dashboard"],
      };

    case "device_monitoring_review":
      return {
        ...basePayload,
        includeChecklists: true,
      };

    case "campaign_strategy_review":
      return {
        ...basePayload,
        lookbackDays: 30,
        limit: 10,
      };

    case "screen_distribution_optimizer":
      return {
        ...basePayload,
        campaignId: context.campaignId,
        objective: "balance",
      };

    case "campaign_targeting_planner":
      return {
        ...basePayload,
        baseCampaignId: context.campaignId,
        goal: "awareness",
      };

    case "campaign_ab_suggester":
      return {
        ...basePayload,
        campaignId: context.campaignId,
        variants: 2,
      };

    case "campaign_review_scheduler":
      return {
        ...basePayload,
        cadence: "weekly",
        dayOfWeek: 1, // Monday
      };

    case "studio_engagement_campaign":
      return {
        ...basePayload,
        goal: "activate_team",
        suggestedDurationDays: 14,
      };

    case "studio_training_guide":
      return {
        ...basePayload,
        audience: "owners",
        durationMinutes: 60,
      };

    case "studio_goal_planner":
      return {
        ...basePayload,
        timeFrame: "monthly",
        metrics: ["new_designs"],
      };

    case "content_calendar_builder":
      return {
        ...basePayload,
        timeFrameDays: 30,
        channels: ["cnet"],
      };

    default:
      return basePayload;
  }
}

