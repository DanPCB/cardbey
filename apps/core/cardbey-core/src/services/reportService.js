/**
 * Report Service
 * 
 * Unified service for generating all types of tenant reports.
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { indexSingleReportToRag } from './reportRagIngestionService.js';
import { generateInsightsForReport } from './insightService.js';

const prisma = new PrismaClient();

// Initialize OpenAI client
if (!process.env.OPENAI_API_KEY) {
  console.warn('[Report Service] WARNING: OPENAI_API_KEY not configured. Report generation will not work.');
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000, // 60 second timeout for report generation
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);

/**
 * Reporter Agent System Prompt
 */
const REPORTER_AGENT_SYSTEM_PROMPT = `You are the Cardbey Activity Reporter. You receive a JSON summary of events for a tenant for one day. Write a concise markdown report in English for humans (store owners and operators).

Focus on: overview, key events, issues, and suggested actions. Avoid raw JSON and log noise; explain in plain language with headings and bullet points.

Format the report with:
- A brief overview section
- Key events section (what happened)
- Issues section (if any problems occurred)
- Suggested actions (if any)

Keep it concise but informative.`;

/**
 * Normalize events into a structured summary
 */
function normalizeEventsForSummary(events) {
  const summary = {
    totalEvents: events.length,
    eventTypes: {},
    deviceEvents: [],
    playlistEvents: [],
    errors: [],
    feedback: [],
    timeline: [],
  };

  for (const event of events) {
    // Count by type
    summary.eventTypes[event.type] = (summary.eventTypes[event.type] || 0) + 1;

    // Categorize events
    if (event.type === 'device_heartbeat' || event.type === 'device_status_change') {
      summary.deviceEvents.push({
        type: event.type,
        deviceId: event.deviceId,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    } else if (event.type === 'playlist_assigned' || event.type === 'playlist_error') {
      summary.playlistEvents.push({
        type: event.type,
        deviceId: event.deviceId,
        playlistId: event.payload?.playlistId,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    } else if (event.type === 'playlist_error') {
      summary.errors.push({
        type: event.type,
        deviceId: event.deviceId,
        error: event.payload?.error,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    } else if (
      event.type === 'assistant_bad_answer' ||
      event.type === 'assistant_good_answer' ||
      event.type === 'feedback_positive' ||
      event.type === 'feedback_negative'
    ) {
      summary.feedback.push({
        type: event.type,
        userId: event.userId,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    }

    // Add to timeline (simplified)
    summary.timeline.push({
      type: event.type,
      occurredAt: event.occurredAt,
      deviceId: event.deviceId,
    });
  }

  // Sort timeline by time
  summary.timeline.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));

  return summary;
}

/**
 * Generate LLM report content
 */
async function generateReportContent(systemPrompt, userPrompt) {
  if (!HAS_OPENAI) {
    throw new Error('OpenAI API key not configured');
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * Generate executive summary for a report
 * 
 * @param {Object} report - Report object with kind, periodKey, contentMd
 * @returns {Promise<{summary: string, nextActions: string[]} | null>}
 */
export async function generateReportExecutiveSummary(report) {
  if (!HAS_OPENAI) {
    console.warn('[Report Service] OpenAI not configured, skipping executive summary generation');
    return null;
  }

  const { kind, periodKey, contentMd } = report;

  // Skip if content is too short
  if (!contentMd || contentMd.trim().length < 500) {
    console.log(`[Report Service] Report content too short (${contentMd?.length || 0} chars), skipping executive summary`);
    return null;
  }

  try {
    // Truncate content to avoid token limits (keep first 3000 chars)
    const truncatedContent = contentMd.length > 3000
      ? contentMd.substring(0, 3000) + '...'
      : contentMd;

    const systemPrompt = `You are Cardbey's report summarizer. Produce a concise executive summary and 3-5 recommended next actions for busy store owners.

Your response must be valid JSON with this exact structure:
{
  "summary": "2-3 short paragraphs summarizing the key points of this report",
  "nextActions": ["Action 1", "Action 2", "Action 3", "Action 4", "Action 5"]
}

Keep the summary under 200 words. Make next actions specific and actionable. Return ONLY the JSON, no code fences, no explanations.`;

    const userPrompt = `Generate an executive summary for this ${kind} report covering period ${periodKey}:

${truncatedContent}

Return the JSON with summary and nextActions.`;

    console.log(`[Report Service] Generating executive summary for report ${report.id}`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500, // Keep it concise
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    if (!responseText) {
      console.warn(`[Report Service] Empty response from OpenAI for executive summary`);
      return null;
    }

    // Parse JSON response
    let summaryData;
    try {
      // Try to extract JSON from markdown code fences if present
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
      if (jsonMatch) {
        summaryData = JSON.parse(jsonMatch[1]);
      } else {
        // Try parsing as direct JSON
        summaryData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error(`[Report Service] Failed to parse executive summary JSON:`, parseError);
      console.error(`[Report Service] Response text:`, responseText.substring(0, 500));
      return null;
    }

    // Validate structure
    if (!summaryData.summary || !Array.isArray(summaryData.nextActions)) {
      console.warn(`[Report Service] Invalid executive summary structure`);
      return null;
    }

    // Ensure nextActions is an array of strings
    const nextActions = summaryData.nextActions
      .filter(action => typeof action === 'string' && action.trim().length > 0)
      .slice(0, 5); // Limit to 5 actions

    if (nextActions.length === 0) {
      console.warn(`[Report Service] No valid next actions in executive summary`);
      return null;
    }

    console.log(`[Report Service] Generated executive summary with ${nextActions.length} actions for report ${report.id}`);

    return {
      summary: summaryData.summary.trim(),
      nextActions,
    };
  } catch (error) {
    console.error(`[Report Service] Failed to generate executive summary for report ${report.id}:`, error.message);
    // Don't throw - return null so PDF can still be generated without summary
    return null;
  }
}

/**
 * Save or update report in database
 */
async function saveReport(reportData) {
  const { tenantId, kind, periodKey } = reportData;

  // Check if report already exists
  const existingReport = await prisma.tenantReport.findFirst({
    where: {
      tenantId,
      kind,
      periodKey,
    },
  });

  if (existingReport) {
    // Update existing report
    const report = await prisma.tenantReport.update({
      where: { id: existingReport.id },
      data: {
        title: reportData.title,
        contentMd: reportData.contentMd,
        updatedAt: new Date(),
      },
    });
    console.log(`[Report Service] Updated existing report ${report.id}`);
    
    // Generate insights for updated report (fire-and-forget)
    generateInsightsForReport(report).catch((error) => {
      console.error(`[Report Service] Failed to generate insights for report ${report.id}:`, error.message);
    });
    
    return report;
  } else {
    // Create new report
    const report = await prisma.tenantReport.create({
      data: {
        tenantId,
        kind,
        periodKey,
        title: reportData.title,
        contentMd: reportData.contentMd,
        scope: reportData.scope,
        tags: reportData.tags,
      },
    });
    console.log(`[Report Service] Created new report ${report.id}`);
    return report;
  }
}

/**
 * Generate daily tenant report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} date - Date for the report
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateDailyTenantReport(tenantId, date) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  // Calculate date range (00:00:00 to 23:59:59)
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  console.log(`[Report Service] Generating daily report for tenant ${tenantId} for ${date.toISOString().split('T')[0]}`);

  // Load events for this tenant and date
  const events = await prisma.activityEvent.findMany({
    where: {
      tenantId,
      occurredAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      occurredAt: 'asc',
    },
  });

  console.log(`[Report Service] Found ${events.length} events for tenant ${tenantId}`);

  // Normalize into a structured summary
  const summary = normalizeEventsForSummary(events);

  // Generate report content using LLM
  const userPrompt = `Generate a daily activity report based on the following event summary:

${JSON.stringify(summary, null, 2)}

Write a markdown report with:
- Title: "Daily Activity Report – [tenant-id] ([date])"
- Overview section
- Key events section
- Issues section (if any)
- Suggested actions (if any)

Keep it concise and human-readable.`;

  let reportContent = await generateReportContent(REPORTER_AGENT_SYSTEM_PROMPT, userPrompt);
  let reportTitle = '';

  // Extract title from first line or generate it
  const lines = reportContent.split('\n');
  const firstLine = lines[0]?.trim();
  if (firstLine && firstLine.startsWith('# ')) {
    reportTitle = firstLine.substring(2);
    reportContent = lines.slice(1).join('\n').trim();
  } else {
    // Generate title
    const dateStr = date.toISOString().split('T')[0];
    reportTitle = `Daily Activity Report – ${tenantId} (${dateStr})`;
  }

  if (!reportContent) {
    throw new Error('Generated report content is empty');
  }

  // Save report
  const periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
  const report = await saveReport({
    tenantId,
    kind: 'daily_tenant',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'tenant_activity',
    tags: 'daily,tenant_activity',
  });

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
    console.log(`[Report Service] Indexed report ${report.id} into RAG`);
  } catch (error) {
    console.error('[Report Service] Error indexing report into RAG:', error);
  }

  // Generate insights (non-blocking)
  generateInsightsForReport(report).catch((error) => {
    console.error('[Report Service] Error generating insights for report:', error);
  });

  return report;
}

/**
 * Generate daily device report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {string} deviceId - Device ID
 * @param {Date} date - Date for the report
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateDailyDeviceReport(tenantId, deviceId, date) {
  if (!tenantId || !deviceId) {
    throw new Error('tenantId and deviceId are required');
  }

  // Get device info
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      name: true,
      status: true,
      tenantId: true,
    },
  });

  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  if (device.tenantId !== tenantId) {
    throw new Error('Device does not belong to tenant');
  }

  // Calculate date range
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  console.log(`[Report Service] Generating daily device report for device ${deviceId} on ${date.toISOString().split('T')[0]}`);

  // Load events for this device and date
  const events = await prisma.activityEvent.findMany({
    where: {
      tenantId,
      deviceId,
      occurredAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      occurredAt: 'asc',
    },
  });

  console.log(`[Report Service] Found ${events.length} events for device ${deviceId}`);

  // Build summary
  const summary = {
    deviceId: device.id,
    deviceName: device.name || deviceId,
    deviceStatus: device.status,
    totalEvents: events.length,
    eventTypes: {},
    playlistAssignments: 0,
    heartbeats: 0,
    errors: [],
    statusChanges: [],
    timeline: [],
  };

  for (const event of events) {
    summary.eventTypes[event.type] = (summary.eventTypes[event.type] || 0) + 1;

    if (event.type === 'playlist_assigned') {
      summary.playlistAssignments++;
    } else if (event.type === 'device_heartbeat') {
      summary.heartbeats++;
    } else if (event.type === 'playlist_error') {
      summary.errors.push({
        type: event.type,
        error: event.payload?.error,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    } else if (event.type === 'device_status_change') {
      summary.statusChanges.push({
        type: event.type,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    }

    summary.timeline.push({
      type: event.type,
      occurredAt: event.occurredAt,
    });
  }

  const dateStr = date.toISOString().split('T')[0];
  const formattedDate = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });

  // Generate report content
  const userPrompt = `Generate a daily device report for device ${device.name || deviceId} on ${formattedDate}.

Summary:
${JSON.stringify(summary, null, 2)}

Write a markdown report with:
# Daily Device Report – ${device.name || deviceId} (${formattedDate})

## Overview
Short paragraph summarizing:
- total playlist assignments on this device
- any errors / warnings
- uptime / heartbeat count if available

## Key Events
- Playlist assignments with timestamps (HH:mm:ss)
- Any repairs / status changes
- Any orientation changes

## Issues
${summary.errors.length > 0 
  ? 'List any errors or suspicious states for this device that day:' 
  : 'No issues were reported during this period.'}

## Suggested Actions
Provide 2-3 bullets with actionable suggestions based on the issues above.`;

  let reportContent = await generateReportContent(REPORTER_AGENT_SYSTEM_PROMPT, userPrompt);
  let reportTitle = '';

  const lines = reportContent.split('\n');
  const firstLine = lines[0]?.trim();
  if (firstLine && firstLine.startsWith('# ')) {
    reportTitle = firstLine.substring(2);
    reportContent = lines.slice(1).join('\n').trim();
  } else {
    reportTitle = `Daily Device Report – ${device.name || deviceId} (${formattedDate})`;
  }

  if (!reportContent) {
    throw new Error('Generated report content is empty');
  }

  // Generate suggested actions for device reports
  const { buildDeviceSuggestedActions } = await import('./reports/deviceSuggestedActions.js');
  const suggestedActions = buildDeviceSuggestedActions({ tenantId, deviceId });

  // Save report
  const periodKey = dateStr; // YYYY-MM-DD format (not including deviceId)
  const report = await saveReport({
    tenantId,
    kind: 'daily_device',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'device_activity',
    tags: `daily,device_activity,device:${deviceId}`,
  });

  // Attach suggested actions to report object (not stored in DB, added to response)
  report.suggestedActions = suggestedActions;
  
  // Also add markdown text for backward compatibility
  if (suggestedActions.length > 0) {
    const actionsMarkdown = suggestedActions
      .map((action) => `- ${action.body}`)
      .join('\n');
    report.suggestedActionsText = `## Suggested Actions\n\n${actionsMarkdown}`;
  } else {
    report.suggestedActionsText = '';
  }

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
  } catch (error) {
    console.error('[Report Service] Error ingesting report into RAG:', error);
  }

  // Generate insights (non-blocking)
  generateInsightsForReport(report).catch((error) => {
    console.error('[Report Service] Error generating insights for report:', error);
  });

  return report;
}

/**
 * Generate weekly tenant report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} weekStart - Start of the week (Monday)
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateWeeklyTenantReport(tenantId, weekStart) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  // Calculate week range (Monday to Sunday)
  const startOfWeek = new Date(weekStart);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(weekStart);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  // Format date range for title: "Mon, Dec 1 – Sun, Dec 7, 2025"
  const formatDateForTitle = (d) => {
    return d.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  const formattedRange = `${formatDateForTitle(startOfWeek)} – ${formatDateForTitle(endOfWeek)}`;

  console.log(`[Report Service] Generating weekly tenant report for ${tenantId} for week starting ${startOfWeek.toISOString().split('T')[0]}`);

  // Load events for the week
  const events = await prisma.activityEvent.findMany({
    where: {
      tenantId,
      occurredAt: {
        gte: startOfWeek,
        lte: endOfWeek,
      },
    },
    orderBy: {
      occurredAt: 'asc',
    },
  });

  // Load campaigns
  const campaigns = await prisma.campaign.findMany({
    where: {
      // Note: Campaign model may not have tenantId, adjust as needed
      createdAt: {
        gte: startOfWeek,
        lte: endOfWeek,
      },
    },
  });

  // Build summary
  const summary = {
    weekRange: formattedRange,
    totalEvents: events.length,
    totalCampaigns: campaigns.length,
    eventTypes: {},
    deviceActivity: {},
    playlistAssignments: 0,
    errors: [],
    devicesWithMostChanges: {},
  };

  for (const event of events) {
    summary.eventTypes[event.type] = (summary.eventTypes[event.type] || 0) + 1;

    if (event.type === 'playlist_assigned') {
      summary.playlistAssignments++;
      if (event.deviceId) {
        summary.devicesWithMostChanges[event.deviceId] = (summary.devicesWithMostChanges[event.deviceId] || 0) + 1;
      }
    } else if (event.type === 'playlist_error') {
      summary.errors.push({
        type: event.type,
        deviceId: event.deviceId,
        error: event.payload?.error,
        occurredAt: event.occurredAt,
      });
    }

    if (event.deviceId) {
      if (!summary.deviceActivity[event.deviceId]) {
        summary.deviceActivity[event.deviceId] = 0;
      }
      summary.deviceActivity[event.deviceId]++;
    }
  }

  // Get top devices by activity
  const topDevices = Object.entries(summary.devicesWithMostChanges)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([deviceId, count]) => ({ deviceId, count }));

  summary.topDevices = topDevices;

  // Get distinct active devices
  const distinctDevices = new Set();
  events.forEach((e) => {
    if (e.deviceId) distinctDevices.add(e.deviceId);
  });

  // Count days with 0 activity
  const daysWithActivity = new Set();
  events.forEach((e) => {
    const day = new Date(e.occurredAt).toISOString().split('T')[0];
    daysWithActivity.add(day);
  });
  const daysWithZeroActivity = 7 - daysWithActivity.size;

  // Generate report content with exact structure
  const userPrompt = `Generate a weekly activity report based on the following summary:

${JSON.stringify(summary, null, 2)}

Additional context:
- Distinct active devices: ${distinctDevices.size}
- Days with 0 activity: ${daysWithZeroActivity}

Write a markdown report with:
# Weekly Activity Report – ${tenantId} (${formattedRange})

## Overview
High-level summary of activity over the week.

## Key Metrics

- Total campaigns launched: ${summary.totalCampaigns}
- Total playlist assignments: ${summary.playlistAssignments}
- Distinct active devices: ${distinctDevices.size}
- Days with 0 activity: ${daysWithZeroActivity > 0 ? daysWithZeroActivity : 'None'}

## Devices with Most Activity

List top 3 devices by playlist assignments / events.

## Issues

Group errors or offline events across the week. Highlight any device that had repeated problems.

## Suggested Actions

Provide 3-5 concrete actions (e.g. stabilise specific devices, run tests, launch more campaigns).`;

  let reportContent = await generateReportContent(REPORTER_AGENT_SYSTEM_PROMPT, userPrompt);
  let reportTitle = '';

  const lines = reportContent.split('\n');
  const firstLine = lines[0]?.trim();
  if (firstLine && firstLine.startsWith('# ')) {
    reportTitle = firstLine.substring(2);
    reportContent = lines.slice(1).join('\n').trim();
  } else {
    reportTitle = `Weekly Activity Report – ${tenantId} (${formattedRange})`;
  }

  if (!reportContent) {
    throw new Error('Generated report content is empty');
  }

  // Save report
  const periodKey = `${startOfWeek.toISOString().split('T')[0]}_week`;
  const report = await saveReport({
    tenantId,
    kind: 'weekly_tenant',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'tenant_activity',
    tags: 'weekly,tenant_activity',
  });

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
  } catch (error) {
    console.error('[Report Service] Error ingesting report into RAG:', error);
  }

  return report;
}

/**
 * Generate content studio activity report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateContentStudioActivityReport(tenantId, from, to) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  // Format date range for title
  const formatDateForTitle = (d) => {
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  const formattedRange = `${formatDateForTitle(startDate)} – ${formatDateForTitle(endDate)}`;

  console.log(`[Report Service] Generating content studio activity report for ${tenantId} from ${formattedRange}`);

  // Load content created/edited in this period
  // Note: Content model has userId, not tenantId directly
  // For now, we'll filter by users that match the tenantId pattern (userId = tenantId)
  const contents = await prisma.content.findMany({
    where: {
      userId: tenantId, // Assuming userId = tenantId pattern
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      name: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Count designs created vs edited
  const designsCreated = contents.length;
  const designsEdited = contents.filter((c) => c.updatedAt > c.createdAt).length;

  // Check for AI generation events (if tracked)
  const aiEvents = await prisma.activityEvent.findMany({
    where: {
      tenantId,
      type: {
        in: ['assistant_good_answer', 'assistant_bad_answer'], // Placeholder - adjust based on actual event types
      },
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // Build summary
  const summary = {
    period: formattedRange,
    designsCreated,
    designsEdited,
    aiGenerations: aiEvents.length, // Stub for now
    templatesUsed: 0, // Stub for now
  };

  // Determine if activity is low/no activity
  const isLowActivity = designsCreated === 0 && designsEdited === 0 && aiEvents.length === 0;

  // Generate report content
  const userPrompt = `Generate a content studio activity report based on the following summary:

${JSON.stringify(summary, null, 2)}

Write a markdown report with:
# Content Studio Activity Report – ${tenantId} (${formattedRange})

## Overview
Summary of content creation and editing activity.

## Design Activity
- Designs created: ${designsCreated}
- Designs edited: ${designsEdited}

## AI Generations
${summary.aiGenerations > 0 ? `- AI generations: ${summary.aiGenerations}` : '- No AI generation data recorded for this period.'}

## Templates Used
${summary.templatesUsed > 0 ? `- Templates used: ${summary.templatesUsed}` : '- No template usage data recorded for this period.'}

## Suggested Next Experiments
Provide suggestions for content experiments based on the activity above.

If metrics show 0 or no data, write helpful text like "No data recorded for X in this period" rather than just showing 0.`;

  let reportContent = await generateReportContent(REPORTER_AGENT_SYSTEM_PROMPT, userPrompt);
  let reportTitle = '';

  const lines = reportContent.split('\n');
  const firstLine = lines[0]?.trim();
  if (firstLine && firstLine.startsWith('# ')) {
    reportTitle = firstLine.substring(2);
    reportContent = lines.slice(1).join('\n').trim();
  } else {
    reportTitle = `Content Studio Activity Report – ${tenantId} (${formattedRange})`;
  }

  if (!reportContent) {
    throw new Error('Generated report content is empty');
  }

  // Generate suggested experiments for low activity scenarios
  let suggestedExperiments = [];
  if (isLowActivity) {
    const { buildLowActivitySuggestedExperiments } = await import('./reports/studioSuggestedExperiments.js');
    suggestedExperiments = buildLowActivitySuggestedExperiments({ tenantId });
  }

  // Save report
  const periodKey = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
  const report = await saveReport({
    tenantId,
    kind: 'content_studio_activity',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'content_studio',
    tags: 'content_studio,activity',
  });

  // Attach suggested experiments to report object (not stored in DB, added to response)
  report.suggestedExperiments = suggestedExperiments;
  
  // Also add markdown text for backward compatibility
  if (suggestedExperiments.length > 0) {
    const experimentsMarkdown = suggestedExperiments
      .map((exp) => `- **${exp.title}**: ${exp.body}`)
      .join('\n');
    report.suggestedExperimentsText = `## Suggested Next Experiments\n\n${experimentsMarkdown}`;
  } else {
    report.suggestedExperimentsText = '';
  }

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
  } catch (error) {
    console.error('[Report Service] Error ingesting report into RAG:', error);
  }

  return report;
}

/**
 * Generate campaign performance report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateCampaignPerformanceReport(tenantId, from, to) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  // Format date range for title
  const formatDateForTitle = (d) => {
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  const formattedRange = `${formatDateForTitle(startDate)} – ${formatDateForTitle(endDate)}`;

  console.log(`[Report Service] Generating campaign performance report for ${tenantId} from ${formattedRange}`);

  // Query campaigns created or updated in the period
  // Note: Campaign model doesn't have tenantId, so we query all campaigns in the period
  const allCampaigns = await prisma.campaign.findMany({
    where: {
      OR: [
        {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        {
          updatedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      workflowId: true,
      data: true,
    },
  });

  // Filter campaigns that might belong to this tenant
  const campaignsInPeriod = allCampaigns.filter((campaign) => {
    if (campaign.data && typeof campaign.data === 'object') {
      const data = campaign.data;
      if (data.tenantId === tenantId || data.tenant === tenantId) {
        return true;
      }
    }
    // For now, include all campaigns - in production you'd have proper tenant linkage
    return true;
  });

  // Query activity events that might be campaign-related
  const campaignEvents = await prisma.activityEvent.findMany({
    where: {
      tenantId,
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
      type: {
        in: ['playlist_assigned', 'playlist_error'],
      },
    },
    select: {
      id: true,
      type: true,
      deviceId: true,
      storeId: true,
      occurredAt: true,
      payload: true,
    },
  });

  // Query devices for this tenant
  const devices = await prisma.device.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  // Note: Screen model doesn't have tenantId, so we can't filter screens by tenant
  // For now, we'll use devices.length as the screen count
  // In production, you might link screens to tenants through devices or playlists
  const screens = [];

  // Build metrics
  const metrics = {
    totalCampaignsInPeriod: campaignsInPeriod.length,
    activeCampaigns: campaignsInPeriod.filter((c) => c.status === 'RUNNING').length,
    pausedOrInactiveCampaigns: campaignsInPeriod.filter(
      (c) => c.status === 'DRAFT' || c.status === 'SCHEDULED' || c.status === 'DONE'
    ).length,
    totalImpressions: campaignEvents.length,
    distinctDevices: new Set(campaignEvents.map((e) => e.deviceId).filter(Boolean)).size,
    distinctScreens: devices.length, // Use device count as screen count (screens don't have tenantId)
  };

  // Find best/worst performing campaigns (by event count)
  const campaignEventCounts = {};
  campaignEvents.forEach((event) => {
    const campaignId = event.payload?.campaignId || event.payload?.campaign?.id;
    if (campaignId) {
      campaignEventCounts[campaignId] = (campaignEventCounts[campaignId] || 0) + 1;
    }
  });

  let bestPerformingCampaign = null;
  let worstPerformingCampaign = null;
  
  if (Object.keys(campaignEventCounts).length > 0) {
    const sortedCampaigns = Object.entries(campaignEventCounts)
      .sort(([, a], [, b]) => b - a);
    
    if (sortedCampaigns.length > 0) {
      const bestId = sortedCampaigns[0][0];
      const worstId = sortedCampaigns[sortedCampaigns.length - 1][0];
      
      bestPerformingCampaign = campaignsInPeriod.find((c) => c.id === bestId);
      worstPerformingCampaign = campaignsInPeriod.find((c) => c.id === worstId);
      
      if (bestPerformingCampaign) {
        bestPerformingCampaign.impressions = campaignEventCounts[bestId];
      }
      if (worstPerformingCampaign) {
        worstPerformingCampaign.impressions = campaignEventCounts[worstId];
      }
    }
  } else if (campaignsInPeriod.length > 0) {
    const sortedByDate = [...campaignsInPeriod].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    bestPerformingCampaign = sortedByDate[0];
    worstPerformingCampaign = sortedByDate[sortedByDate.length - 1];
    bestPerformingCampaign.impressions = 0;
    worstPerformingCampaign.impressions = 0;
  }

  // Find best/worst performing screens/devices
  const deviceEventCounts = {};
  campaignEvents.forEach((event) => {
    if (event.deviceId) {
      deviceEventCounts[event.deviceId] = (deviceEventCounts[event.deviceId] || 0) + 1;
    }
  });

  let bestScreen = null;
  let worstScreen = null;

  if (Object.keys(deviceEventCounts).length > 0) {
    const sortedDevices = Object.entries(deviceEventCounts).sort(([, a], [, b]) => b - a);
    
    if (sortedDevices.length > 0) {
      const bestDeviceId = sortedDevices[0][0];
      const worstDeviceId = sortedDevices[sortedDevices.length - 1][0];
      
      bestScreen = devices.find((d) => d.id === bestDeviceId);
      worstScreen = devices.find((d) => d.id === worstDeviceId);
      
      if (bestScreen) {
        bestScreen.impressions = deviceEventCounts[bestDeviceId];
      }
      if (worstScreen) {
        worstScreen.impressions = deviceEventCounts[worstDeviceId];
      }
    }
  } else if (devices.length > 0) {
    bestScreen = devices[0];
    worstScreen = devices[devices.length - 1];
    bestScreen.impressions = 0;
    worstScreen.impressions = 0;
  }

  // Build markdown report
  let reportContent = '';

  if (metrics.totalCampaignsInPeriod === 0 && metrics.totalImpressions === 0) {
    reportContent = `# Campaign Performance Report – ${tenantId} (${formattedRange})

## Overview

No campaign activity was recorded in this period. Try launching a test campaign and revisit this report later.

## Key Metrics

- Total campaigns in period: 0
- Active campaigns: 0
- Inactive/paused campaigns: 0
- Total impressions: 0
- Distinct devices: 0
- Distinct screens: 0

## Suggested Actions

- Launch a test campaign to begin tracking performance
- Review campaign setup and ensure campaigns are properly configured
- Check device connectivity and playlist assignments`;
  } else {
    reportContent = `# Campaign Performance Report – ${tenantId} (${formattedRange})

## Overview

This report covers campaign performance for the period from ${formatDateForTitle(startDate)} to ${formatDateForTitle(endDate)}. 

${metrics.totalCampaignsInPeriod > 0 
  ? `During this period, ${metrics.totalCampaignsInPeriod} campaign${metrics.totalCampaignsInPeriod !== 1 ? 's were' : ' was'} tracked, with ${metrics.activeCampaigns} active and ${metrics.totalImpressions} total impressions across ${metrics.distinctDevices} device${metrics.distinctDevices !== 1 ? 's' : ''}.`
  : 'No campaigns were found in this period, but some campaign-related activity was detected.'}

## Key Metrics

- Total campaigns in period: ${metrics.totalCampaignsInPeriod}
- Active campaigns: ${metrics.activeCampaigns}
- Inactive/paused campaigns: ${metrics.pausedOrInactiveCampaigns}
- Total impressions: ${metrics.totalImpressions}
- Distinct devices: ${metrics.distinctDevices}
- Distinct screens: ${metrics.distinctScreens}

## Top Campaigns

${bestPerformingCampaign 
  ? `- **Best performing campaign**: ${bestPerformingCampaign.title || bestPerformingCampaign.id} – ${bestPerformingCampaign.impressions || 0} impressions`
  : '- No campaign performance data available'}

${worstPerformingCampaign && worstPerformingCampaign.id !== bestPerformingCampaign?.id
  ? `- **Worst performing campaign**: ${worstPerformingCampaign.title || worstPerformingCampaign.id} – ${worstPerformingCampaign.impressions || 0} impressions`
  : ''}

## Devices / Screens

${bestScreen 
  ? `- **Best performing screen/device**: ${bestScreen.name || bestScreen.id} – ${bestScreen.impressions || 0} impressions`
  : '- No device performance data available'}

${worstScreen && worstScreen.id !== bestScreen?.id
  ? `- **Lowest performing screen/device**: ${worstScreen.name || worstScreen.id} – ${worstScreen.impressions || 0} impressions`
  : ''}

## Suggested Actions

${metrics.pausedOrInactiveCampaigns > 0 
  ? `- Consider pausing campaigns with zero impressions over this period (${metrics.pausedOrInactiveCampaigns} inactive campaign${metrics.pausedOrInactiveCampaigns !== 1 ? 's' : ''} found)`
  : ''}
${bestPerformingCampaign && bestPerformingCampaign.impressions > 0
  ? `- Increase budget or screen coverage for top-performing campaign: ${bestPerformingCampaign.title || bestPerformingCampaign.id}`
  : ''}
${worstScreen && worstScreen.impressions === 0
  ? `- Investigate devices/screens with consistently low activity: ${worstScreen.name || worstScreen.id}`
  : '- Review campaign targeting and device distribution for optimal performance'}`;
  }

  // Generate suggested actions for campaign reports
  const { buildCampaignSuggestedActions } = await import('./reports/campaignSuggestedActions.js');
  const suggestedActions = buildCampaignSuggestedActions({
    tenantId,
    campaignId: bestPerformingCampaign?.id || null,
  });

  // Save report
  const periodKey = `${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
  const reportTitle = `Campaign Performance Report – ${tenantId} (${formattedRange})`;
  
  const report = await saveReport({
    tenantId,
    kind: 'campaign_performance',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'tenant_activity',
    tags: 'campaign,performance,insights',
  });

  // Attach suggested actions to report object (not stored in DB, added to response)
  report.suggestedActions = suggestedActions;
  
  // Also add markdown text for backward compatibility
  if (suggestedActions.length > 0) {
    const actionsMarkdown = suggestedActions
      .map((action) => `- **${action.title}**: ${action.body}`)
      .join('\n');
    report.suggestedActionsText = `## Suggested Actions\n\n${actionsMarkdown}`;
  } else {
    report.suggestedActionsText = '';
  }

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
    console.log(`[Report Service] Ingested campaign performance report ${report.id} into RAG`);
  } catch (error) {
    console.error('[Report Service] Error ingesting report into RAG:', error);
  }

  // Generate insights (non-blocking)
  generateInsightsForReport(report).catch((error) => {
    console.error('[Report Service] Error generating insights for report:', error);
  });

  return report;
}

/**
 * Generate CAI Usage Report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateCaiUsageReport(tenantId, from, to) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  const formatDateForTitle = (d) => {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  const formattedRange = `${formatDateForTitle(startDate)} – ${formatDateForTitle(endDate)}`;

  console.log(`[Report Service] Generating CAI usage report for ${tenantId} from ${formattedRange}`);

  // Query CAI-related activity events
  const caiEvents = await prisma.activityEvent.findMany({
    where: {
      tenantId,
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
      type: {
        in: ['assistant_bad_answer', 'assistant_good_answer'],
      },
    },
    select: {
      id: true,
      type: true,
      userId: true,
      occurredAt: true,
      payload: true,
    },
    orderBy: {
      occurredAt: 'asc',
    },
  });

  // Compute metrics
  const totalPrompts = caiEvents.length;
  const totalCompletions = caiEvents.filter((e) => e.type === 'assistant_good_answer').length;
  const errorsCount = caiEvents.filter((e) => e.type === 'assistant_bad_answer').length;
  
  // Calculate average latency (if available in payload)
  const latencies = caiEvents
    .map((e) => e.payload?.latency || e.payload?.responseTime)
    .filter((l) => typeof l === 'number' && l > 0);
  const averageLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  // Extract top pages/surfaces from payload
  const pageCounts = {};
  caiEvents.forEach((event) => {
    const page = event.payload?.page || event.payload?.surface || event.payload?.context?.mode || 'unknown';
    pageCounts[page] = (pageCounts[page] || 0) + 1;
  });
  const topPages = Object.entries(pageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([page, count]) => ({ page, count }));

  // Build markdown report
  let reportContent = '';

  if (totalPrompts === 0) {
    reportContent = `# CAI Usage Report – ${tenantId} (${formattedRange})

## Overview

No CAI (Cardbey Assistant) usage was recorded in this period. The assistant may not have been used, or usage events were not logged.

## Usage Summary

- Total prompts: 0
- Total completions: 0
- Errors: 0
- Average latency: N/A

## Suggested Actions

- Encourage users to try the Cardbey Assistant
- Check that assistant events are being logged correctly
- Review assistant availability and accessibility`;
  } else {
    reportContent = `# CAI Usage Report – ${tenantId} (${formattedRange})

## Overview

This report covers Cardbey Assistant (CAI) usage for the period from ${formatDateForTitle(startDate)} to ${formatDateForTitle(endDate)}.

During this period, ${totalPrompts} assistant interaction${totalPrompts !== 1 ? 's were' : ' was'} recorded, with ${totalCompletions} successful completion${totalCompletions !== 1 ? 's' : ''} and ${errorsCount} error${errorsCount !== 1 ? 's' : ''}.

## Usage Summary

- **Total prompts**: ${totalPrompts}
- **Total completions**: ${totalCompletions}
- **Success rate**: ${totalPrompts > 0 ? Math.round((totalCompletions / totalPrompts) * 100) : 0}%
- **Errors**: ${errorsCount}
- **Average latency**: ${averageLatency ? `${averageLatency}ms` : 'N/A'}

## Top Surfaces

${topPages.length > 0
        ? topPages.map(({ page, count }) => `- **${page}**: ${count} interaction${count !== 1 ? 's' : ''}`).join('\n')
        : '- No surface data available'}

## Errors & Latency

${errorsCount > 0
        ? `- ${errorsCount} error${errorsCount !== 1 ? 's' : ''} were recorded during this period. Review assistant logs for details.`
        : '- No errors were recorded during this period.'}

${averageLatency
        ? `- Average response time was ${averageLatency}ms. ${averageLatency > 3000 ? 'Consider optimizing assistant performance.' : 'Response times are within acceptable range.'}`
        : '- Latency data was not available for this period.'}

## Suggested Actions

${errorsCount > 0
        ? `- Investigate the ${errorsCount} error${errorsCount !== 1 ? 's' : ''} recorded during this period`
        : ''}
${totalPrompts < 10
        ? '- Encourage more assistant usage to gather better insights'
        : ''}
${topPages.length > 0 && topPages[0].count > totalPrompts * 0.5
        ? `- Focus on optimizing assistant experience for "${topPages[0].page}" (most used surface)`
        : ''}
- Review assistant feedback and adjust responses based on user interactions`;
  }

  // Save report
  const periodKey = `${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
  const reportTitle = `CAI Usage Report – ${tenantId} (${formattedRange})`;

  const report = await saveReport({
    tenantId,
    kind: 'cai_usage',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'tenant_activity',
    tags: 'cai,usage,insights',
  });

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
    console.log(`[Report Service] Ingested CAI usage report ${report.id} into RAG`);
  } catch (error) {
    console.error('[Report Service] Error ingesting report into RAG:', error);
  }

  return report;
}

/**
 * Generate Device Health Report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateDeviceHealthReport(tenantId, from, to) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  const formatDateForTitle = (d) => {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  const formattedRange = `${formatDateForTitle(startDate)} – ${formatDateForTitle(endDate)}`;

  console.log(`[Report Service] Generating device health report for ${tenantId} from ${formattedRange}`);

  // Query devices for this tenant
  const devices = await prisma.device.findMany({
    where: {
      tenantId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  // Query device-related activity events
  const deviceEvents = await prisma.activityEvent.findMany({
    where: {
      tenantId,
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
      type: {
        in: ['device_heartbeat', 'device_status_change', 'playlist_error'],
      },
    },
    select: {
      id: true,
      type: true,
      deviceId: true,
      occurredAt: true,
      payload: true,
    },
    orderBy: {
      occurredAt: 'asc',
    },
  });

  // Calculate uptime and health metrics per device
  const deviceHealth = {};
  const periodMs = endDate.getTime() - startDate.getTime();
  const expectedHeartbeats = Math.floor(periodMs / (5 * 60 * 1000)); // Assuming 5-minute heartbeat interval

  devices.forEach((device) => {
    const deviceEventsForDevice = deviceEvents.filter((e) => e.deviceId === device.id);
    const heartbeats = deviceEventsForDevice.filter((e) => e.type === 'device_heartbeat');
    const errors = deviceEventsForDevice.filter((e) => e.type === 'playlist_error' || (e.type === 'device_status_change' && e.payload?.status === 'OFFLINE'));
    
    const uptimePercentage = expectedHeartbeats > 0
      ? Math.min(100, Math.round((heartbeats.length / expectedHeartbeats) * 100))
      : 0;

    deviceHealth[device.id] = {
      device,
      heartbeats: heartbeats.length,
      errors: errors.length,
      uptimePercentage,
      lastSeen: device.lastSeenAt,
      status: device.status,
    };
  });

  // Compute overall metrics
  const totalDevices = devices.length;
  const devicesWithLowUptime = Object.values(deviceHealth).filter((h) => h.uptimePercentage < 95).length;
  const devicesWithErrors = Object.values(deviceHealth).filter((h) => h.errors > 0).length;
  const totalErrors = Object.values(deviceHealth).reduce((sum, h) => sum + h.errors, 0);

  // Find devices requiring attention
  const devicesRequiringAttention = Object.values(deviceHealth)
    .filter((h) => h.uptimePercentage < 95 || h.errors > 3 || h.status === 'OFFLINE')
    .sort((a, b) => {
      // Sort by priority: low uptime first, then high errors
      if (a.uptimePercentage !== b.uptimePercentage) {
        return a.uptimePercentage - b.uptimePercentage;
      }
      return b.errors - a.errors;
    })
    .slice(0, 10);

  // Build markdown report
  let reportContent = '';

  if (totalDevices === 0) {
    reportContent = `# Device Health Report – ${tenantId} (${formattedRange})

## Overview

No devices were found for this tenant in this period.

## Suggested Actions

- Ensure devices are properly registered and linked to this tenant
- Check device configuration and connectivity`;
  } else {
    reportContent = `# Device Health Report – ${tenantId} (${formattedRange})

## Overview

This report covers device health and uptime for the period from ${formatDateForTitle(startDate)} to ${formatDateForTitle(endDate)}.

During this period, ${totalDevices} device${totalDevices !== 1 ? 's were' : ' was'} monitored, with ${devicesWithLowUptime} device${devicesWithLowUptime !== 1 ? 's' : ''} showing uptime below 95% and ${devicesWithErrors} device${devicesWithErrors !== 1 ? 's' : ''} experiencing errors.

## Uptime Summary

- **Total devices**: ${totalDevices}
- **Devices with uptime < 95%**: ${devicesWithLowUptime}
- **Devices with errors**: ${devicesWithErrors}
- **Total errors recorded**: ${totalErrors}
- **Average uptime**: ${totalDevices > 0 ? Math.round(Object.values(deviceHealth).reduce((sum, h) => sum + h.uptimePercentage, 0) / totalDevices) : 0}%

## Devices Requiring Attention

${devicesRequiringAttention.length > 0
        ? devicesRequiringAttention.map((h) => {
            const deviceName = h.device.name || h.device.id;
            const issues = [];
            if (h.uptimePercentage < 95) issues.push(`Uptime: ${h.uptimePercentage}%`);
            if (h.errors > 0) issues.push(`${h.errors} error${h.errors !== 1 ? 's' : ''}`);
            if (h.status === 'OFFLINE') issues.push('Status: OFFLINE');
            return `- **${deviceName}**: ${issues.join(', ')}`;
          }).join('\n')
        : '- No devices require immediate attention'}

## Error Patterns

${totalErrors > 0
        ? `- ${totalErrors} total error${totalErrors !== 1 ? 's' : ''} were recorded across ${devicesWithErrors} device${devicesWithErrors !== 1 ? 's' : ''}`
        : '- No errors were recorded during this period'}

${devicesRequiringAttention.length > 0
        ? `- ${devicesRequiringAttention.length} device${devicesRequiringAttention.length !== 1 ? 's' : ''} require${devicesRequiringAttention.length === 1 ? 's' : ''} immediate attention`
        : ''}

## Recommendations

${devicesWithLowUptime > 0
        ? `- Investigate ${devicesWithLowUptime} device${devicesWithLowUptime !== 1 ? 's' : ''} with low uptime (< 95%)`
        : ''}
${devicesWithErrors > 0
        ? `- Review error logs for ${devicesWithErrors} device${devicesWithErrors !== 1 ? 's' : ''} experiencing errors`
        : ''}
${devicesRequiringAttention.length > 0
        ? `- Prioritize fixing issues for the ${devicesRequiringAttention.length} device${devicesRequiringAttention.length !== 1 ? 's' : ''} listed above`
        : ''}
- Monitor device connectivity and network stability
- Review device firmware and software versions
- Check for scheduled maintenance windows`;
  }

  // Save report
  const periodKey = `${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
  const reportTitle = `Device Health Report – ${tenantId} (${formattedRange})`;

  const report = await saveReport({
    tenantId,
    kind: 'device_health',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'tenant_activity',
    tags: 'device,health,uptime,insights',
  });

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
    console.log(`[Report Service] Ingested device health report ${report.id} into RAG`);
  } catch (error) {
    console.error('[Report Service] Error ingesting report into RAG:', error);
  }

  return report;
}

/**
 * Weekly AI Assistant Summary System Prompt
 */
const WEEKLY_AI_SUMMARY_SYSTEM_PROMPT = `You are Cardbey's AI Assistant. Your role is to analyze a week's worth of reports for a tenant and provide a concise, actionable summary.

You will receive a list of reports from the past week, each with a title and a brief snippet of content. Your task is to:

1. **Overview**: Provide a high-level summary of the week's activity (2-3 sentences)
2. **Highlights**: List 3-5 key positive highlights or achievements from the week
3. **Risks**: Identify any concerning patterns, issues, or risks that need attention (if any)
4. **Recommended Actions**: Provide 3-5 concrete, actionable recommendations for the tenant

Keep the summary concise, professional, and focused on actionable insights. Use markdown formatting with clear headings and bullet points.`;

/**
 * Generate Weekly AI Assistant Summary Report
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateWeeklyAiSummaryReport(tenantId, from, to) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  if (!HAS_OPENAI) {
    throw new Error('OpenAI API key not configured. AI summary generation requires OpenAI.');
  }

  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  const formatDateForTitle = (d) => {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  const formattedRange = `${formatDateForTitle(startDate)} – ${formatDateForTitle(endDate)}`;

  console.log(`[Report Service] Generating weekly AI summary for ${tenantId} from ${formattedRange}`);

  // Load all reports for the period
  const reports = await prisma.tenantReport.findMany({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      // Exclude previous AI summaries to avoid recursion
      kind: {
        not: 'weekly_ai_summary',
      },
    },
    select: {
      id: true,
      kind: true,
      title: true,
      contentMd: true,
      periodKey: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (reports.length === 0) {
    // No reports to summarize - create a simple report
    const reportContent = `# Weekly AI Assistant Summary – ${tenantId} (${formattedRange})

## Overview

No reports were generated for this tenant during the specified period. This may indicate:
- The tenant is new and hasn't generated reports yet
- Reports are scheduled but haven't run yet
- There was no activity to report on

## Recommended Actions

- Ensure report generation is scheduled and running correctly
- Check that tenant devices and systems are properly configured
- Review tenant activity to ensure events are being logged`;

    const periodKey = `${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
    const reportTitle = `Weekly AI Assistant Summary – ${tenantId} (${formattedRange})`;

    const report = await saveReport({
      tenantId,
      kind: 'weekly_ai_summary',
      periodKey,
      title: reportTitle,
      contentMd: reportContent,
      scope: 'tenant_activity',
      tags: 'ai,summary,assistant',
    });

    // Ingest into RAG
    try {
      await indexSingleReportToRag(report);
      console.log(`[Report Service] Ingested weekly AI summary ${report.id} into RAG`);
    } catch (error) {
      console.error('[Report Service] Error ingesting report into RAG:', error);
    }

    return report;
  }

  // Build a compact prompt with report summaries
  // Truncate each report's content to first 500 chars for context
  const reportSummaries = reports.map((report) => {
    const snippet = report.contentMd
      ? report.contentMd.substring(0, 500).replace(/\n+/g, ' ').trim()
      : '(No content)';
    
    return {
      kind: report.kind,
      title: report.title,
      periodKey: report.periodKey,
      snippet: snippet + (report.contentMd && report.contentMd.length > 500 ? '...' : ''),
    };
  });

  const userPrompt = `Please analyze the following reports from the past week for tenant ${tenantId} and provide a comprehensive summary.

Reports (${reports.length} total):
${JSON.stringify(reportSummaries, null, 2)}

Please provide:
1. **Overview**: High-level summary of the week
2. **Highlights**: Key positive achievements or milestones
3. **Risks**: Any concerning patterns or issues that need attention
4. **Recommended Actions**: 3-5 concrete, actionable next steps

Format your response as clean markdown with clear headings.`;

  // Generate summary using OpenAI
  let summaryContent;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: WEEKLY_AI_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    summaryContent = completion.choices[0]?.message?.content || 'Unable to generate summary.';
  } catch (error) {
    console.error('[Report Service] Error calling OpenAI for AI summary:', error);
    // Fallback summary
    summaryContent = `# Weekly AI Assistant Summary – ${tenantId} (${formattedRange})

## Overview

This week, ${reports.length} report${reports.length !== 1 ? 's were' : ' was'} generated covering various aspects of tenant activity.

## Highlights

- ${reports.length} report${reports.length !== 1 ? 's' : ''} generated across ${new Set(reports.map((r) => r.kind)).size} different report type${new Set(reports.map((r) => r.kind)).size !== 1 ? 's' : ''}
- Reports cover: ${Array.from(new Set(reports.map((r) => r.kind))).join(', ')}

## Recommended Actions

- Review the detailed reports for specific insights
- Address any issues identified in individual reports
- Continue monitoring tenant activity and system health`;
  }

  // Build the final report content with header
  const reportContent = `# Weekly AI Assistant Summary – ${tenantId} (${formattedRange})

${summaryContent}

---

*This summary was generated by Cardbey's AI Assistant based on ${reports.length} report${reports.length !== 1 ? 's' : ''} from ${formattedRange}.*`;

  // Save report
  const periodKey = `${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
  const reportTitle = `Weekly AI Assistant Summary – ${tenantId} (${formattedRange})`;

  const report = await saveReport({
    tenantId,
    kind: 'weekly_ai_summary',
    periodKey,
    title: reportTitle,
    contentMd: reportContent,
    scope: 'tenant_activity',
    tags: 'ai,summary,assistant',
  });

  // Ingest into RAG
  try {
    await indexSingleReportToRag(report);
    console.log(`[Report Service] Ingested weekly AI summary ${report.id} into RAG`);
  } catch (error) {
    console.error('[Report Service] Error ingesting report into RAG:', error);
  }

  return report;
}
