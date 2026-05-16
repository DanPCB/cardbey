/**
 * Reporter Agent Types
 * TypeScript interfaces for the Reporter Agent
 */

/**
 * Activity Event Summary
 * Represents a single event in the activity summary
 */
export interface ActivityEventSummary {
  time: string; // Time string, e.g. "09:02"
  type: string; // Event type, e.g. "playlist_assigned", "playlist_error", "feedback_negative", "device_status_change"
  details: string; // Human-readable event description
}

/**
 * Activity Stats
 * Aggregated statistics for a reporting period
 */
export interface ActivityStats {
  playlistAssignments?: number;
  deviceErrors?: number;
  feedbackNegative?: number;
  devicesOffline?: number;
  [key: string]: number | undefined; // Allow additional stats
}

/**
 * Daily Tenant Reporter Input
 * Input format for generating a daily tenant report
 */
export interface DailyTenantReporterInput {
  tenantId: string;
  tenantName: string;
  date: string; // ISO date string, e.g. "2025-12-05"
  events: ActivityEventSummary[];
  stats: ActivityStats;
}

/**
 * Reporter Response
 * Response from the Reporter Agent
 */
export interface ReporterResponse {
  /** Generated markdown report content */
  contentMd: string;
  /** Report title */
  title: string;
  /** Report scope/category */
  scope: string;
  /** Optional tags for filtering */
  tags?: string;
}

