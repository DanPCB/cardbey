/**
 * Report Scheduler
 * 
 * Auto-generates reports for all active tenants on a schedule using cron.
 * 
 * Environment Variables:
 *   REPORT_SCHEDULER_ENABLED=true - Enable the scheduler (default: false)
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import {
  generateDailyTenantReport,
  generateDailyDeviceReport,
  generateWeeklyTenantReport,
  generateContentStudioActivityReport,
  generateCampaignPerformanceReport,
} from '../services/reportService.js';
import { getDiscoveryStats } from '../lib/discovery/UnclaimedStoreService.js';

let dailyJob = null;
let weeklyJob = null;
let isInitialized = false;

const PLATFORM_DISCOVERY_TENANT_ID =
  process.env.DISCOVERY_REPORT_TENANT_ID || '__platform_discovery__';

/**
 * Get list of active tenant IDs
 * Uses distinct tenantIds from Device table
 * Can be refined later to use a dedicated Tenant model if available
 */
async function getActiveTenantIdsForReports() {
  const devices = await prisma.device.findMany({
    where: {},
    select: {
      tenantId: true,
    },
    distinct: ['tenantId'],
  });

  return devices
    .map((d) => d.tenantId)
    .filter((id) => !!id && id.trim().length > 0);
}

/**
 * Get yesterday's date (00:00:00)
 */
function getYesterdayDateRange() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday;
}

/**
 * Get last week's Monday (00:00:00)
 */
function getLastWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days to subtract to get to Monday of current week
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  // Then subtract 7 more days to get to previous week's Monday
  const previousMonday = new Date(now);
  previousMonday.setDate(now.getDate() - daysToMonday - 7);
  previousMonday.setHours(0, 0, 0, 0);
  
  // Calculate Sunday of that week
  const previousSunday = new Date(previousMonday);
  previousSunday.setDate(previousMonday.getDate() + 6);
  previousSunday.setHours(23, 59, 59, 999);
  
  return {
    weekStart: previousMonday,
    weekEnd: previousSunday,
  };
}

/**
 * Check if report already exists (idempotency check)
 */
async function reportExists(tenantId, kind, periodKey) {
  const existing = await prisma.tenantReport.findFirst({
    where: {
      tenantId,
      kind,
      periodKey,
    },
  });
  return !!existing;
}

/**
 * Run daily reports job
 * Generates daily tenant reports and daily device reports for yesterday
 */
export async function runDailyReportsJob() {
  const startTime = Date.now();
  console.log('[ReportScheduler] ===== Starting daily reports job =====');
  
  try {
    const tenantIds = await getActiveTenantIdsForReports();
    console.log(`[ReportScheduler] Found ${tenantIds.length} active tenants`);
    
    if (tenantIds.length === 0) {
      console.log('[ReportScheduler] No active tenants found, skipping daily reports');
      return {
        tenantsProcessed: 0,
        reportsCreated: 0,
        reportsSkipped: 0,
        errors: [],
      };
    }
    
    const yesterday = getYesterdayDateRange();
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let reportsCreated = 0;
    let reportsSkipped = 0;
    const errors = [];
    
    // Generate daily tenant reports
    for (const tenantId of tenantIds) {
      try {
        const periodKey = yesterdayStr;
        const exists = await reportExists(tenantId, 'daily_tenant', periodKey);
        
        if (exists) {
          console.log(`[ReportScheduler] Daily tenant report already exists for tenant=${tenantId} period=${periodKey}, skipping`);
          reportsSkipped++;
          continue;
        }
        
        console.log(`[ReportScheduler] Generating daily tenant report for tenant=${tenantId} date=${yesterdayStr}`);
        const report = await generateDailyTenantReport(tenantId, yesterday);
        console.log(`[ReportScheduler] ✓ Generated daily_tenant for tenant=${tenantId} period=${report.periodKey}`);
        reportsCreated++;
      } catch (error) {
        const errorMsg = error.message || String(error);
        console.error(`[ReportScheduler] ✗ Error generating daily tenant report for ${tenantId}:`, errorMsg);
        errors.push({ tenantId, kind: 'daily_tenant', error: errorMsg });
        // Continue with next tenant
      }
    }
    
    // Generate daily device reports for each tenant's devices
    for (const tenantId of tenantIds) {
      try {
        const devices = await prisma.device.findMany({
          where: {
            tenantId,
          },
          select: {
            id: true,
            name: true,
          },
        });
        
        for (const device of devices) {
          try {
            // Note: daily_device reports use date as periodKey (YYYY-MM-DD), not deviceId
            // This means multiple devices for the same tenant on the same day would share the same periodKey
            // The saveReport function handles idempotency by updating existing reports
            // We check if a report exists for this device by checking tags (which include device:${deviceId})
            const periodKey = yesterdayStr;
            const existingReports = await prisma.tenantReport.findMany({
              where: {
                tenantId,
                kind: 'daily_device',
                periodKey,
              },
            });
            
            // Check if this specific device's report exists by looking at tags
            const deviceReportExists = existingReports.some(
              (r) => r.tags && r.tags.includes(`device:${device.id}`)
            );
            
            if (deviceReportExists) {
              console.log(`[ReportScheduler] Daily device report already exists for tenant=${tenantId} device=${device.id} period=${periodKey}, skipping`);
              reportsSkipped++;
              continue;
            }
            
            console.log(`[ReportScheduler] Generating daily device report for tenant=${tenantId} device=${device.id} date=${yesterdayStr}`);
            const report = await generateDailyDeviceReport(tenantId, device.id, yesterday);
            console.log(`[ReportScheduler] ✓ Generated daily_device for tenant=${tenantId} device=${device.id} period=${report.periodKey}`);
            reportsCreated++;
          } catch (error) {
            const errorMsg = error.message || String(error);
            console.error(`[ReportScheduler] ✗ Error generating daily device report for ${tenantId}/${device.id}:`, errorMsg);
            errors.push({ tenantId, deviceId: device.id, kind: 'daily_device', error: errorMsg });
            // Continue with next device
          }
        }
      } catch (error) {
        const errorMsg = error.message || String(error);
        console.error(`[ReportScheduler] ✗ Error fetching devices for tenant ${tenantId}:`, errorMsg);
        errors.push({ tenantId, kind: 'device_fetch', error: errorMsg });
      }
    }
    
    // Platform discovery stats (last 24h)
    try {
      await refreshDiscoveryDailyStats();
    } catch (discoveryErr) {
      console.error('[ReportScheduler] Discovery daily stats failed (non-fatal):', discoveryErr?.message || discoveryErr);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[ReportScheduler] ===== Daily reports job completed in ${duration}s =====`);
    console.log(`[ReportScheduler] Summary: ${reportsCreated} created, ${reportsSkipped} skipped, ${errors.length} errors`);
    
    if (errors.length > 0) {
      console.log('[ReportScheduler] Errors:');
      errors.forEach((err) => {
        console.log(`  - ${err.tenantId}${err.deviceId ? `/${err.deviceId}` : ''} [${err.kind}]: ${err.error}`);
      });
    }
    
    return {
      tenantsProcessed: tenantIds.length,
      reportsCreated,
      reportsSkipped,
      errors,
    };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[ReportScheduler] ===== Daily reports job failed after ${duration}s =====`);
    console.error('[ReportScheduler] Error in daily reports job:', error);
    throw error;
  }
}

/**
 * Run weekly reports job
 * Generates weekly tenant, content studio, and campaign performance reports
 */
export async function runWeeklyReportsJob() {
  const startTime = Date.now();
  console.log('[ReportScheduler] ===== Starting weekly reports job =====');
  
  try {
    const tenantIds = await getActiveTenantIdsForReports();
    console.log(`[ReportScheduler] Found ${tenantIds.length} active tenants`);
    
    if (tenantIds.length === 0) {
      console.log('[ReportScheduler] No active tenants found, skipping weekly reports');
      return {
        tenantsProcessed: 0,
        reportsCreated: 0,
        reportsSkipped: 0,
        errors: [],
      };
    }
    
    const { weekStart, weekEnd } = getLastWeekRange();
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const periodKey = `${weekStartStr}_week`;
    
    let reportsCreated = 0;
    let reportsSkipped = 0;
    const errors = [];
    
    for (const tenantId of tenantIds) {
      try {
        // Generate weekly tenant report
        try {
          const exists = await reportExists(tenantId, 'weekly_tenant', periodKey);
          if (exists) {
            console.log(`[ReportScheduler] Weekly tenant report already exists for tenant=${tenantId} period=${periodKey}, skipping`);
            reportsSkipped++;
          } else {
            console.log(`[ReportScheduler] Generating weekly tenant report for tenant=${tenantId} weekStart=${weekStartStr}`);
            const report = await generateWeeklyTenantReport(tenantId, weekStart);
            console.log(`[ReportScheduler] ✓ Generated weekly_tenant for tenant=${tenantId} period=${report.periodKey}`);
            reportsCreated++;
          }
        } catch (error) {
          const errorMsg = error.message || String(error);
          console.error(`[ReportScheduler] ✗ Error generating weekly tenant report for ${tenantId}:`, errorMsg);
          errors.push({ tenantId, kind: 'weekly_tenant', error: errorMsg });
        }
        
        // Generate content studio activity report
        try {
          // periodKey format: YYYY-MM-DD_YYYY-MM-DD (underscore separator, no "to")
          const contentStudioPeriodKey = `${weekStartStr}_${weekEndStr}`;
          const exists = await reportExists(tenantId, 'content_studio_activity', contentStudioPeriodKey);
          if (exists) {
            console.log(`[ReportScheduler] Content studio report already exists for tenant=${tenantId} period=${contentStudioPeriodKey}, skipping`);
            reportsSkipped++;
          } else {
            console.log(`[ReportScheduler] Generating content studio report for tenant=${tenantId} from=${weekStartStr} to=${weekEndStr}`);
            const report = await generateContentStudioActivityReport(tenantId, weekStart, weekEnd);
            console.log(`[ReportScheduler] ✓ Generated content_studio_activity for tenant=${tenantId} period=${report.periodKey}`);
            reportsCreated++;
          }
        } catch (error) {
          const errorMsg = error.message || String(error);
          console.error(`[ReportScheduler] ✗ Error generating content studio report for ${tenantId}:`, errorMsg);
          errors.push({ tenantId, kind: 'content_studio_activity', error: errorMsg });
        }
        
        // Generate campaign performance report
        try {
          // periodKey format: YYYY-MM-DD_to_YYYY-MM-DD (with "to" separator)
          const campaignPeriodKey = `${weekStartStr}_to_${weekEndStr}`;
          const exists = await reportExists(tenantId, 'campaign_performance', campaignPeriodKey);
          if (exists) {
            console.log(`[ReportScheduler] Campaign performance report already exists for tenant=${tenantId} period=${campaignPeriodKey}, skipping`);
            reportsSkipped++;
          } else {
            console.log(`[ReportScheduler] Generating campaign performance report for tenant=${tenantId} from=${weekStartStr} to=${weekEndStr}`);
            const report = await generateCampaignPerformanceReport(tenantId, weekStart, weekEnd);
            console.log(`[ReportScheduler] ✓ Generated campaign_performance for tenant=${tenantId} period=${report.periodKey}`);
            reportsCreated++;
          }
        } catch (error) {
          const errorMsg = error.message || String(error);
          console.error(`[ReportScheduler] ✗ Error generating campaign performance report for ${tenantId}:`, errorMsg);
          errors.push({ tenantId, kind: 'campaign_performance', error: errorMsg });
        }
      } catch (error) {
        const errorMsg = error.message || String(error);
        console.error(`[ReportScheduler] ✗ Error processing tenant ${tenantId} for weekly reports:`, errorMsg);
        errors.push({ tenantId, kind: 'weekly_processing', error: errorMsg });
      }
    }
    
    // Platform discovery stats (last 7d)
    try {
      await refreshDiscoveryWeeklyStats();
    } catch (discoveryErr) {
      console.error('[ReportScheduler] Discovery weekly stats failed (non-fatal):', discoveryErr?.message || discoveryErr);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[ReportScheduler] ===== Weekly reports job completed in ${duration}s =====`);
    console.log(`[ReportScheduler] Summary: ${reportsCreated} created, ${reportsSkipped} skipped, ${errors.length} errors`);
    
    if (errors.length > 0) {
      console.log('[ReportScheduler] Errors:');
      errors.forEach((err) => {
        console.log(`  - ${err.tenantId} [${err.kind}]: ${err.error}`);
      });
    }
    
    return {
      tenantsProcessed: tenantIds.length,
      reportsCreated,
      reportsSkipped,
      errors,
    };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[ReportScheduler] ===== Weekly reports job failed after ${duration}s =====`);
    console.error('[ReportScheduler] Error in weekly reports job:', error);
    throw error;
  }
}

function mapBatchSummary(b) {
  const started = b.startedAt ? new Date(b.startedAt).getTime() : 0;
  const completed = b.completedAt ? new Date(b.completedAt).getTime() : Date.now();
  return {
    seedType: b.seedType ?? null,
    seedValue: b.seedValue ?? null,
    discovered: b.discovered ?? 0,
    scraped: b.scraped ?? 0,
    created: b.created ?? 0,
    skipped: b.skipped ?? 0,
    failed: b.failed ?? 0,
    preBuilt: b.preBuilt ?? 0,
    duration: started ? completed - started : 0,
  };
}

async function loadDiscoveryReportPayload(periodKey) {
  const existing = await prisma.tenantReport.findFirst({
    where: {
      tenantId: PLATFORM_DISCOVERY_TENANT_ID,
      kind: 'discovery_daily',
      periodKey,
    },
  });
  if (!existing?.contentMd) {
    return { sections: [], discoveryStats: null };
  }
  try {
    return JSON.parse(existing.contentMd);
  } catch {
    return { sections: [], discoveryStats: null };
  }
}

async function saveDiscoveryReport(periodKey, payload) {
  const today = periodKey;
  const title = `Discovery Report – ${today}`;
  const contentMd = JSON.stringify(payload, null, 2);
  const existing = await prisma.tenantReport.findFirst({
    where: {
      tenantId: PLATFORM_DISCOVERY_TENANT_ID,
      kind: 'discovery_daily',
      periodKey: today,
    },
  });
  if (existing) {
    return prisma.tenantReport.update({
      where: { id: existing.id },
      data: { title, contentMd, updatedAt: new Date() },
    });
  }
  return prisma.tenantReport.create({
    data: {
      tenantId: PLATFORM_DISCOVERY_TENANT_ID,
      kind: 'discovery_daily',
      periodKey: today,
      title,
      contentMd,
      scope: 'discovery_pipeline',
      tags: 'discovery,daily',
    },
  });
}

/**
 * Append discovery batch summaries to today's platform discovery report.
 * @param {object[]} batchSummaries
 */
export async function appendDiscoveryReport(batchSummaries) {
  if (!Array.isArray(batchSummaries) || batchSummaries.length === 0) {
    return null;
  }

  const periodKey = new Date().toISOString().split('T')[0];
  const payload = await loadDiscoveryReportPayload(periodKey);
  const batches = batchSummaries.map(mapBatchSummary);

  const section = {
    type: 'discovery_batch',
    timestamp: new Date().toISOString(),
    batches,
    totals: {
      discovered: batches.reduce((s, b) => s + b.discovered, 0),
      created: batches.reduce((s, b) => s + b.created, 0),
      preBuilt: batches.reduce((s, b) => s + b.preBuilt, 0),
      failed: batches.reduce((s, b) => s + b.failed, 0),
    },
  };

  payload.sections = Array.isArray(payload.sections) ? payload.sections : [];
  payload.sections.push(section);
  payload.updatedAt = new Date().toISOString();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  payload.discoveryStats = await getDiscoveryStats(since24h);

  return saveDiscoveryReport(periodKey, payload);
}

async function refreshDiscoveryDailyStats() {
  const periodKey = new Date().toISOString().split('T')[0];
  const payload = await loadDiscoveryReportPayload(periodKey);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  payload.discoveryStats = await getDiscoveryStats(since24h);
  payload.updatedAt = new Date().toISOString();
  return saveDiscoveryReport(periodKey, payload);
}

async function refreshDiscoveryWeeklyStats() {
  const periodKey = new Date().toISOString().split('T')[0];
  const payload = await loadDiscoveryReportPayload(periodKey);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  payload.discoveryStatsWeekly = await getDiscoveryStats(since7d);
  payload.updatedAt = new Date().toISOString();
  return saveDiscoveryReport(periodKey, payload);
}

/**
 * Initialize the report scheduler
 * Sets up cron jobs for daily and weekly report generation
 */
export function initReportScheduler() {
  const enabled = process.env.REPORT_SCHEDULER_ENABLED === 'true';
  
  if (!enabled) {
    console.log('[ReportScheduler] Disabled (REPORT_SCHEDULER_ENABLED != true)');
    return;
  }
  
  if (isInitialized) {
    console.log('[ReportScheduler] Already initialized');
    return;
  }
  
  // Daily job: Run at 01:00 server time
  // Cron: minute hour day month dayOfWeek
  // '0 1 * * *' = At 01:00 every day
  dailyJob = cron.schedule('0 1 * * *', () => {
    console.log('[ReportScheduler] Daily job triggered by cron');
    runDailyReportsJob().catch((error) => {
      console.error('[ReportScheduler] Unhandled error in daily reports job:', error);
    });
  }, {
    scheduled: true,
    timezone: 'UTC', // Adjust if needed
  });
  
  // Weekly job: Run on Monday at 02:00 server time
  // '0 2 * * 1' = At 02:00 every Monday
  weeklyJob = cron.schedule('0 2 * * 1', () => {
    console.log('[ReportScheduler] Weekly job triggered by cron');
    runWeeklyReportsJob().catch((error) => {
      console.error('[ReportScheduler] Unhandled error in weekly reports job:', error);
    });
  }, {
    scheduled: true,
    timezone: 'UTC', // Adjust if needed
  });
  
  isInitialized = true;
  console.log('[ReportScheduler] ✅ Scheduler initialized');
  console.log('[ReportScheduler] Daily reports: 01:00 UTC (cron: 0 1 * * *)');
  console.log('[ReportScheduler] Weekly reports: Monday 02:00 UTC (cron: 0 2 * * 1)');
}

/**
 * Stop the report scheduler
 */
export function stopReportScheduler() {
  if (dailyJob) {
    dailyJob.stop();
    dailyJob = null;
  }
  
  if (weeklyJob) {
    weeklyJob.stop();
    weeklyJob = null;
  }
  
  isInitialized = false;
  console.log('[ReportScheduler] Scheduler stopped');
}
