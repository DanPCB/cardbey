/**
 * Generate Daily Reports Script
 * 
 * Generates daily reports for all active tenants.
 * Can be run manually or via cron/scheduler.
 * 
 * Usage: npm run reports:daily-all
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generateDailyTenantReport, generateWeeklyTenantReport } from '../src/services/reportService.js';

const prisma = new PrismaClient();

/**
 * Get all unique tenant IDs from devices
 * Prefers a Tenant table if it exists, otherwise uses distinct tenantIds from Device
 */
async function getActiveTenantIds(): Promise<string[]> {
  // TODO: If a Tenant table exists, use:
  // const tenants = await prisma.tenant.findMany({
  //   where: { status: 'active' },
  //   select: { id: true },
  // });
  // return tenants.map((t) => t.id);

  // Fallback: distinct tenantIds from Device
  const devices = await prisma.device.findMany({
    where: {},
    select: {
      tenantId: true,
    },
    distinct: ['tenantId'],
  });

  return devices
    .map((d) => d.tenantId)
    .filter((id): id is string => !!id && id.trim().length > 0);
}

/**
 * Get yesterday's date (00:00:00 in local time)
 */
function getYesterday(): Date {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Get last Monday's date (00:00:00)
 */
function getLastMonday(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back to Monday
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - daysToSubtract - 7); // Go back to previous week's Monday
  lastMonday.setHours(0, 0, 0, 0);
  return lastMonday;
}

/**
 * Main function to generate daily reports for all tenants
 */
async function main() {
  const tenantIds = await getActiveTenantIds();
  const date = getYesterday();

  console.log('[DailyReports] Starting for', tenantIds.length, 'tenants. Date:', date.toISOString().slice(0, 10));

  if (tenantIds.length === 0) {
    console.warn('[DailyReports] No active tenants found');
    await prisma.$disconnect();
    return;
  }

  let success = 0;
  let failed = 0;
  const errors: Array<{ tenantId: string; error: string }> = [];

  // Generate daily reports for each tenant
  for (const tenantId of tenantIds) {
    try {
      await generateDailyTenantReport(tenantId, date);
      success++;
      console.log(`[DailyReports] OK tenant=${tenantId}`);
    } catch (err: any) {
      failed++;
      const errorMessage = err?.message || String(err);
      console.error(`[DailyReports] ERROR tenant=${tenantId}`, errorMessage);
      errors.push({
        tenantId,
        error: errorMessage,
      });
    }
  }

  // Optional: Generate weekly reports if today is Monday
  // TODO: Uncomment to enable weekly report generation on Mondays
  // const today = new Date();
  // if (today.getDay() === 1) { // Monday
  //   console.log('[DailyReports] Today is Monday, generating weekly reports...');
  //   const weekStart = getLastMonday();
  //   
  //   for (const tenantId of tenantIds) {
  //     try {
  //       await generateWeeklyTenantReport(tenantId, weekStart);
  //       console.log(`[DailyReports] Weekly report OK tenant=${tenantId}`);
  //     } catch (err: any) {
  //       console.error(`[DailyReports] Weekly report ERROR tenant=${tenantId}`, err?.message || String(err));
  //     }
  //   }
  // }

  console.log(`[DailyReports] Done. Success=${success}/${tenantIds.length}`);
  
  if (errors.length > 0) {
    console.log('\n[DailyReports] Errors:');
    errors.forEach(({ tenantId, error }) => {
      console.log(`  - ${tenantId}: ${error}`);
    });
  }

  await prisma.$disconnect();
}

// Run report generation
main().catch((err) => {
  console.error('[DailyReports] Fatal error', err);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});

/**
 * CRON SETUP INSTRUCTIONS
 * 
 * To run this script daily via system cron:
 * 
 * 1. Add to crontab (crontab -e):
 * 
 *    # Run every day at 01:30 UTC
 *    30 1 * * * cd /path/to/apps/core/cardbey-core && npm run reports:daily-all >> logs/reports.log 2>&1
 * 
 * 2. Or using a specific Node version:
 * 
 *    30 1 * * * cd /path/to/apps/core/cardbey-core && /usr/bin/node /path/to/node_modules/.bin/tsx scripts/generateDailyReports.ts >> logs/reports.log 2>&1
 * 
 * 3. For Render.com or similar platforms:
 *    - Use the "Cron Job" feature
 *    - Schedule: "30 1 * * *" (01:30 UTC daily)
 *    - Command: "cd apps/core/cardbey-core && npm run reports:daily-all"
 * 
 * 4. For GitHub Actions:
 *    - Create .github/workflows/daily-reports.yml
 *    - Use schedule: cron: '30 1 * * *'
 *    - Run: npm run reports:daily-all
 * 
 * Note: Ensure OPENAI_API_KEY environment variable is set in the cron environment.
 */

