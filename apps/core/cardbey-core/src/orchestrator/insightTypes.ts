/**
 * Insight Orchestrator Types
 * 
 * Defines types for AI-triggered Insight actions from dashboard (AI buttons).
 * These entry points are triggered from insight cards, reports, or PDF previews.
 */

/**
 * Orchestrator Entry Point
 * 
 * Valid entry points for insight-triggered actions, grouped by domain:
 * - Devices: Device health, monitoring, and maintenance actions
 * - Campaigns: Campaign strategy, optimization, and planning actions
 * - Studio/Content: Content studio engagement and planning actions
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

/**
 * Orchestrator Context
 * 
 * Shared context metadata for all orchestrator tasks
 */
export interface OrchestratorContext {
  tenantId: string;
  userId: string;
  source: "insight_card" | "report" | "pdf_preview";
  insightId?: string;
  locale?: string;
  /** Current OrchestratorTask id; use as missionId for AgentMessage */
  taskId?: string;
}

/**
 * Orchestrator Insight Request
 * 
 * Request payload for executing an insight action
 */
export interface OrchestratorInsightRequest {
  entryPoint: OrchestratorEntryPoint;
  payload: any; // Entry point-specific payload
  context: OrchestratorContext;
}

/**
 * Orchestrator Insight Response
 * 
 * Response from executing an insight action
 */
export interface OrchestratorInsightResponse {
  taskId: string;
  status: "queued" | "running" | "completed" | "failed";
  message?: string;
}

// ============================================================================
// Payload Types (Entry Point Specific)
// ============================================================================

/**
 * Device Health Check Payload
 */
export interface DeviceHealthCheckPayload {
  scope: "tenant" | "store" | "device";
  tenantId: string;
  storeId?: string;
  deviceId?: string;
  lookbackMinutes?: number; // Default 60
}

/**
 * Playlist Assignment Audit Payload
 */
export interface PlaylistAssignmentAuditPayload {
  tenantId: string;
  storeId?: string;
  deviceId?: string;
  windowHours?: number; // Default 24
}

/**
 * Device Maintenance Plan Payload
 */
export interface DeviceMaintenancePlanPayload {
  tenantId: string;
  deviceId: string;
  frequencyDays?: number; // Default 7
  createCalendarEvents?: boolean;
}

/**
 * Device Alert Setup Heartbeats Payload
 */
export interface DeviceAlertSetupHeartbeatsPayload {
  tenantId: string;
  deviceIds?: string[]; // If not provided, applies to all tenant devices
  offlineThresholdMinutes?: number; // Default 10
  channels?: string[]; // e.g. ['dashboard', 'email']
}

/**
 * Device Monitoring Review Payload
 */
export interface DeviceMonitoringReviewPayload {
  tenantId: string;
  includeChecklists?: boolean;
}

/**
 * Campaign Strategy Review Payload
 */
export interface CampaignStrategyReviewPayload {
  tenantId: string;
  lookbackDays?: number; // Default 30
  limit?: number; // Default 10
}

/**
 * Screen Distribution Optimizer Payload
 */
export interface ScreenDistributionOptimizerPayload {
  tenantId: string;
  campaignId?: string;
  objective?: "balance" | "maximize_reach" | "minimize_cost";
}

/**
 * Campaign Targeting Planner Payload
 */
export interface CampaignTargetingPlannerPayload {
  tenantId: string;
  baseCampaignId?: string;
  goal?: "awareness" | "engagement" | "conversion";
}

/**
 * Campaign A/B Suggester Payload
 */
export interface CampaignAbSuggesterPayload {
  tenantId: string;
  campaignId?: string;
  variants?: number; // Default 2
}

/**
 * Campaign Review Scheduler Payload
 */
export interface CampaignReviewSchedulerPayload {
  tenantId: string;
  cadence?: "weekly" | "monthly";
  dayOfWeek?: number; // 0-6 (Sunday-Saturday)
}

/**
 * Studio Engagement Campaign Payload
 */
export interface StudioEngagementCampaignPayload {
  tenantId: string;
  goal?: "activate_team" | "increase_usage" | "onboard_new_users";
  suggestedDurationDays?: number; // Default 7
}

/**
 * Studio Training Guide Payload
 */
export interface StudioTrainingGuidePayload {
  tenantId: string;
  audience?: "owners" | "operators" | "designers";
  durationMinutes?: number; // Default 60
}

/**
 * Studio Goal Planner Payload
 */
export interface StudioGoalPlannerPayload {
  tenantId: string;
  timeFrame?: "weekly" | "monthly" | "quarterly";
  metrics?: string[]; // e.g. ['new_designs', 'publishes', 'templates_used']
}

/**
 * Content Calendar Builder Payload
 */
export interface ContentCalendarBuilderPayload {
  tenantId: string;
  timeFrameDays?: number; // Default 30
  channels?: string[]; // e.g. ['cnet', 'social']
}

