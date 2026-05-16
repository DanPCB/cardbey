/**
 * Run Reports Once Script
 * 
 * Manual script to trigger report generation for testing.
 * Can run daily or weekly reports without waiting for cron schedule.
 * 
 * Usage:
 *   node scripts/runReportsOnce.js daily
 *   node scripts/runReportsOnce.js weekly
 *   node scripts/runReportsOnce.js both
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runDailyReportsJob, runWeeklyReportsJob } from '../src/scheduler/reportScheduler.js';

const prisma = new PrismaClient();

async function main() {
  const mode = process.argv[2] || 'both';
  
  console.log('[RunReportsOnce] Starting manual report generation...');
  console.log(`[RunReportsOnce] Mode: ${mode}`);
  
  try {
    if (mode === 'daily' || mode === 'both') {
      console.log('\n[RunReportsOnce] ===== Running Daily Reports =====');
      const dailyResult = await runDailyReportsJob();
      console.log('\n[RunReportsOnce] Daily Reports Summary:');
      console.log(`  Tenants processed: ${dailyResult.tenantsProcessed}`);
      console.log(`  Reports created: ${dailyResult.reportsCreated}`);
      console.log(`  Reports skipped: ${dailyResult.reportsSkipped}`);
      console.log(`  Errors: ${dailyResult.errors.length}`);
    }
    
    if (mode === 'weekly' || mode === 'both') {
      console.log('\n[RunReportsOnce] ===== Running Weekly Reports =====');
      const weeklyResult = await runWeeklyReportsJob();
      console.log('\n[RunReportsOnce] Weekly Reports Summary:');
      console.log(`  Tenants processed: ${weeklyResult.tenantsProcessed}`);
      console.log(`  Reports created: ${weeklyResult.reportsCreated}`);
      console.log(`  Reports skipped: ${weeklyResult.reportsSkipped}`);
      console.log(`  Errors: ${weeklyResult.errors.length}`);
    }
    
    console.log('\n[RunReportsOnce] ✅ Manual report generation completed');
  } catch (error) {
    console.error('[RunReportsOnce] ❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

