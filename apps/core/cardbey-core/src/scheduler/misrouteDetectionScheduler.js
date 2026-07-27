/**
 * Daily batch job: detect intent misroutes from skill dispatch feedback.
 */
import cron from 'node-cron';
import { detectIntentMisroutes } from '../jobs/detectIntentMisroutes.js';

let misrouteJob = null;
let isRunning = false;

async function runMisrouteDetectionJob() {
  if (isRunning) {
    console.log('[MisrouteDetection] Job already running, skipping');
    return;
  }

  isRunning = true;
  const started = Date.now();

  try {
    console.log('[MisrouteDetection] Running intent misroute detection...');
    const result = await detectIntentMisroutes();
    const durationMs = Date.now() - started;
    console.log(
      `[MisrouteDetection] Processed ${result.processed} misroute groups, created/updated ${result.proposals} proposals (${durationMs}ms)`,
    );
  } catch (error) {
    console.error('[MisrouteDetection] Job failed:', error?.message || error);
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule daily misroute detection at 02:00 UTC.
 */
export function initMisrouteDetectionScheduler() {
  if (misrouteJob) {
    console.log('[MisrouteDetection] Scheduler already initialized');
    return;
  }

  misrouteJob = cron.schedule(
    '0 2 * * *',
    () => {
      runMisrouteDetectionJob().catch((error) => {
        console.error('[MisrouteDetection] Unhandled scheduler error:', error);
      });
    },
    { scheduled: true, timezone: 'UTC' },
  );

  console.log('[MisrouteDetection] ✅ Scheduler initialized (daily 02:00 UTC)');
}

export function stopMisrouteDetectionScheduler() {
  if (misrouteJob) {
    misrouteJob.stop();
    misrouteJob = null;
    console.log('[MisrouteDetection] Scheduler stopped');
  }
}

export { runMisrouteDetectionJob };
