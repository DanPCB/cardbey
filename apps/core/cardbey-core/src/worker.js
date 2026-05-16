/**
 * Cardbey Core Worker Process
 * Runs background jobs without binding to any port
 * 
 * This process handles:
 * - Journey planner runner
 * - Notification sender
 * - TODO: Marketing-dashboard background jobs after migration
 */

// Load environment variables first so DATABASE_URL/engine flags are present.
import './env/loadEnv.js';

// MUST run before any PrismaClient: normalize DATABASE_URL for SQLite (file:)
import './env/ensureDatabaseUrl.js';
import { startPlannerRunner, sendUpcomingNotifications } from './services/planner-runner.js';
import { startScreenStatusChecker } from './worker/screenStatusChecker.js';
import { processImageGenerationJobs } from './services/menuVisualAgent/imageGenerationJob.js';

console.log('🔧 Starting Cardbey Core Worker...');
console.log(`📍 ROLE: ${process.env.ROLE || 'worker'}`);
console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

// Import background services

// TODO: Import marketing-dashboard background jobs after migration
// import { startScheduler } from './scheduler/index.js';
// import { startAgentScheduler } from './scheduler/agentScheduler.js';
// import { startDeviceWatcher } from './scheduler/deviceWatcher.js';
// import { shareQueue } from './worker/shareQueue.js';

async function startWorker() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  🔧 Cardbey Core Worker Process            ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  
  // Journeys planner (existing from cardbey-core)
  console.log('✅ Starting planner runner (60s polling)...');
  startPlannerRunner(60000); // Check every minute
  
  console.log('✅ Starting notification sender (5min interval)...');
  setInterval(() => {
    sendUpcomingNotifications().catch(err => {
      console.error('[Planner] Notification error:', err);
    });
  }, 5 * 60 * 1000);
  
  // Screen status checker - pings screens directly
  startScreenStatusChecker(20000); // Check every 20 seconds (with backoff for failed screens)
  
  // Menu Visual Agent - image generation jobs
  console.log('✅ Starting menu image generation worker (30s polling)...');
  setInterval(() => {
    processImageGenerationJobs(5).catch(err => {
      console.error('[MenuVisualAgent] Job processing error:', err);
    });
  }, 30000); // Every 30 seconds
  
  // TODO: Add marketing-dashboard workers here after migration
  // console.log('✅ Starting scheduler (cron jobs)...');
  // startScheduler();
  
  // console.log('✅ Starting agent scheduler...');
  // startAgentScheduler();
  
  // console.log('✅ Starting device watcher (5min polling)...');
  // startDeviceWatcher();
  
  // console.log('✅ Starting share queue worker...');
  // shareQueue.start();
  
  console.log('\n✅ All background workers initialized');
  console.log('📊 Active Services:');
  console.log('   - Journey Planner (60s)');
  console.log('   - Notification Sender (5min)');
  console.log('   - Screen Status Checker (20s, with backoff)');
  console.log('   - Menu Image Generation (30s)');
  console.log('   - TODO: Marketing schedulers (after migration)\n');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 Worker shutting down (SIGTERM)...');
  // Add cleanup logic here (stop intervals, close DB connections, etc.)
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Worker shutting down (SIGINT)...');
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection in worker:', reason);
  // Don't exit on unhandled rejection in production, just log
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception in worker:', error);
  // Exit on uncaught exception (critical)
  process.exit(1);
});

// Start the worker
startWorker().catch(err => {
  console.error('❌ Worker startup failed:', err);
  process.exit(1);
});






