/**
 * Insight Types
 * 
 * Standardized types for insights and actions across the Cardbey system.
 */

export type OrchestratorEntryPoint =
  // Devices
  | "device_health_check"
  | "playlist_assignment_audit"
  | "device_maintenance_plan"
  | "device_alert_setup_heartbeats"
  | "device_monitoring_review"
  // Campaigns
  | "campaign_strategy_review"
  | "screen_distribution_optimizer"
  | "campaign_targeting_planner"
  | "campaign_ab_suggester"
  | "campaign_review_scheduler"
  // Studio / Content
  | "studio_engagement_campaign"
  | "studio_training_guide"
  | "studio_goal_planner"
  | "content_calendar_builder";

export type InsightSource =
  | "insight_card"
  | "report"
  | "pdf_preview";

export interface InsightActionNavigation {
  href: string;
  label?: string;
}

export interface InsightAction {
  id: string;
  description: string;
  entryPoint: OrchestratorEntryPoint;
  payload: Record<string, any>;
  navigation?: InsightActionNavigation;
  source?: InsightSource;
  priority?: "primary" | "secondary";
}

export interface Insight {
  id: string;
  title: string;
  body: string;
  score?: number;
  // NEW:
  action?: InsightAction;
  // Allow arbitrary insight metadata:
  [key: string]: any;
}

/**
 * Suggested Experiment Insight
 * Used in reports to suggest actionable experiments
 */
export interface SuggestedExperimentInsight {
  id: string;
  title: string;
  body: string;
  action: InsightAction;
  category: string;
  score?: number;
  [key: string]: any;
}
