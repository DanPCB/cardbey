/**
 * System Watcher Scheduled Job
 * Generates insights from system events every 5-10 minutes
 */

import { getRecentEvents, computeAggregates } from '../services/systemEventsService.js';
import { createSystemInsight } from '../services/systemInsightsService.js';
import { runSystemWatcher } from '../orchestrator/systemWatcher.js';

let insightJobInterval = null;
let isRunning = false;

/**
 * Run insight generation job
 */
async function runInsightGeneration() {
  if (isRunning) {
    console.log('[SystemWatcher] Insight generation already running, skipping');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('[SystemWatcher] Starting scheduled insight generation');

    // Get events from last 10 minutes
    const to = new Date();
    const from = new Date(to.getTime() - 10 * 60 * 1000); // 10 minutes ago

    const events = await getRecentEvents({
      from,
      to,
      limit: 500,
    });

    if (events.length === 0) {
      console.log('[SystemWatcher] No events to analyze');
      return;
    }

    // Compute aggregates
    const aggregates = computeAggregates(events);

    // Call orchestrator
    const result = await runSystemWatcher({
      question: null,
      events: events.map((e) => ({
        id: e.id,
        source: e.source,
        type: e.type,
        severity: e.severity,
        deviceId: e.deviceId,
        tenantId: e.tenantId,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
      aggregates,
    });

    // Save insights
    for (const insight of result.insights) {
      try {
        await createSystemInsight({
          title: insight.title,
          severity: insight.severity,
          category: insight.category,
          summary: insight.summary,
          payload: insight,
        });
      } catch (error) {
        console.error('[SystemWatcher] Failed to save insight:', error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[SystemWatcher] Insight generation complete (${duration}ms, ${result.insights.length} insights)`);
  } catch (error) {
    console.error('[SystemWatcher] Error during insight generation:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the insight generation job
 * Runs every 10 minutes
 * 
 * @param {number} [intervalMinutes=10] - Interval in minutes
 */
export function startInsightGenerationJob(intervalMinutes = 10) {
  if (insightJobInterval) {
    console.log('[SystemWatcher] Insight generation job already started');
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  // Run immediately on start
  runInsightGeneration().catch((error) => {
    console.error('[SystemWatcher] Error in initial insight generation:', error);
  });

  // Then run on interval
  insightJobInterval = setInterval(() => {
    runInsightGeneration().catch((error) => {
      console.error('[SystemWatcher] Error in scheduled insight generation:', error);
    });
  }, intervalMs);

  console.log(`[SystemWatcher] ✅ Insight generation job started (interval: ${intervalMinutes} minutes)`);
}

/**
 * Stop the insight generation job
 */
export function stopInsightGenerationJob() {
  if (insightJobInterval) {
    clearInterval(insightJobInterval);
    insightJobInterval = null;
    console.log('[SystemWatcher] Insight generation job stopped');
  }
}

