/**
 * Reporter Agent Prompts
 * System prompts and examples for the Activity Reporter Agent
 */

/**
 * System prompt for Daily Tenant Reporter
 * Used to generate human-readable markdown reports from activity events
 */
export const DAILY_TENANT_REPORTER_SYSTEM_PROMPT = `You are the Cardbey Activity Reporter.

You receive a JSON summary of events for ONE tenant for ONE day.

Your job is to produce a concise, human-readable report in MARKDOWN.

Audience:
- Store owners and operators using Cardbey.
- They are not developers and should not see raw logs or stack traces.

Reporting guidelines:
- Start with a short overview section.
- Then list key events in bullet points or short paragraphs.
- Highlight any issues or errors in a separate "Issues" section.
- Provide a "Suggested Actions" section with 2–5 practical next steps.
- Use clear headings, for example:
  - # Daily Activity Report – Tenant: {tenantName} ({date})
  - ## Overview
  - ## Key Events
  - ## Issues
  - ## Suggested Actions

Constraints:
- Do NOT invent events that are not in the input.
- If there were no major issues, explicitly state that the day was stable.
- If the input is empty, say that there were no recorded events for that day.

Respond with ONLY the markdown report, no JSON, no explanations.`;

/**
 * Example user content format for Daily Tenant Reporter
 * This shows the expected structure of the input JSON
 */
export const DAILY_TENANT_REPORTER_EXAMPLE_INPUT = {
  tenantId: "cafe-123",
  tenantName: "Morning Brew Cafe",
  date: "2025-12-05",
  events: [
    { 
      time: "09:02", 
      type: "playlist_assigned", 
      details: "Playlist 'Morning Menu' assigned to device 'Front Window TV'." 
    },
    { 
      time: "09:05", 
      type: "playlist_error", 
      details: "Front Window TV failed to load video: 404 for asset 'menu-hero.mp4'." 
    },
    { 
      time: "11:33", 
      type: "feedback_negative", 
      details: "User reported: 'Screen still black after assignment' from dashboard." 
    },
    { 
      time: "15:10", 
      type: "device_status_change", 
      details: "Counter Tablet went offline." 
    }
  ],
  stats: {
    playlistAssignments: 1,
    deviceErrors: 1,
    feedbackNegative: 1,
    devicesOffline: 1
  }
};

/**
 * Type definition for Daily Tenant Reporter input
 */
export interface DailyTenantReporterInput {
  tenantId: string;
  tenantName: string;
  date: string; // ISO date string, e.g. "2025-12-05"
  events: Array<{
    time: string; // Time string, e.g. "09:02"
    type: string; // Event type, e.g. "playlist_assigned", "playlist_error", "feedback_negative", "device_status_change"
    details: string; // Human-readable event description
  }>;
  stats: {
    playlistAssignments?: number;
    deviceErrors?: number;
    feedbackNegative?: number;
    devicesOffline?: number;
    [key: string]: number | undefined; // Allow additional stats
  };
}

