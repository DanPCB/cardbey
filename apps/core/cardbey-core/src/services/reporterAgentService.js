/**
 * Reporter Agent Service
 * 
 * Generates daily tenant reports from activity events using LLM.
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { ingestTenantReportToRag } from './ragService.js';

const prisma = new PrismaClient();

// Initialize OpenAI client
if (!process.env.OPENAI_API_KEY) {
  console.warn('[Reporter Agent] WARNING: OPENAI_API_KEY not configured. Report generation will not work.');
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
 * Generate a daily tenant report
 * 
 * @param {Object} options
 * @param {string} options.tenantId - Tenant ID
 * @param {Date} options.date - Date for the report (will be interpreted in server timezone)
 * @returns {Promise<Object>} Created TenantReport
 */
export async function generateTenantDailyReport({ tenantId, date }) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  if (!HAS_OPENAI) {
    throw new Error('OpenAI API key not configured');
  }

  // Calculate date range (00:00:00 to 23:59:59 in server timezone)
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  console.log(`[Reporter Agent] Generating daily report for tenant ${tenantId} for ${date.toISOString().split('T')[0]}`);

  // 1) Load ActivityEvent rows for that tenant and date range
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

  console.log(`[Reporter Agent] Found ${events.length} events for tenant ${tenantId}`);

  // 2) Normalize into a structured summary
  const summary = normalizeEventsForSummary(events);

  // 3) Call OpenAI with Reporter Agent prompt
  const userPrompt = `Generate a daily activity report based on the following event summary:

${JSON.stringify(summary, null, 2)}

Write a markdown report with:
- Title: "Daily Activity Report – [tenant-id] ([date])"
- Overview section
- Key events section
- Issues section (if any)
- Suggested actions (if any)

Keep it concise and human-readable.`;

  let reportContent = '';
  let reportTitle = '';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REPORTER_AGENT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    reportContent = completion.choices[0]?.message?.content || '';

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
  } catch (error) {
    console.error('[Reporter Agent] Error generating report:', error);
    throw new Error(`Failed to generate report: ${error.message}`);
  }

  if (!reportContent) {
    throw new Error('Generated report content is empty');
  }

  // 4) Save TenantReport in DB
  const periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Check if report already exists
  const existingReport = await prisma.tenantReport.findFirst({
    where: {
      tenantId,
      kind: 'daily_tenant',
      periodKey,
    },
  });

  let report;
  if (existingReport) {
    // Update existing report
    report = await prisma.tenantReport.update({
      where: { id: existingReport.id },
      data: {
        title: reportTitle,
        contentMd: reportContent,
        updatedAt: new Date(),
      },
    });
    console.log(`[Reporter Agent] Updated existing report ${report.id}`);
  } else {
    // Create new report
    report = await prisma.tenantReport.create({
      data: {
        tenantId,
        kind: 'daily_tenant',
        periodKey,
        title: reportTitle,
        contentMd: reportContent,
        scope: 'tenant_activity',
        tags: 'daily,tenant_activity',
      },
    });
    console.log(`[Reporter Agent] Created new report ${report.id}`);
  }

  // 5) Trigger RAG ingestion for that report
  try {
    await ingestTenantReportToRag({ report });
    console.log(`[Reporter Agent] Ingested report ${report.id} into RAG`);
  } catch (error) {
    console.error('[Reporter Agent] Error ingesting report into RAG:', error);
    // Don't fail the whole operation if RAG ingestion fails
  }

  // 6) Return the saved TenantReport
  return report;
}

