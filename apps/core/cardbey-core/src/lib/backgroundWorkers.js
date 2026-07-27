/**
 * Singleton guards for API background workers — prevents duplicate intervals
 * when nodemon restarts overlap or listen callback runs more than once.
 */

import { cleanupRateLimitStore } from '../middleware/rateLimit.js';
import { startOfflineWatcher, stopOfflineWatcher } from '../worker/offlineWatcher.js';
import { startSessionCleanup, stopSessionCleanup } from '../worker/sessionCleanup.js';
import { startDeviceCleanupWorker, stopDeviceCleanupWorker } from '../worker/deviceCleanup.js';
import { reconcileStaleOrchestraMirrors } from './orchestraMirror.js';
import { resumeOrphanedDeferredStorePipelines } from './storeMission/deferredStorePipelineRunner.js';
import { initReportScheduler, stopReportScheduler } from '../scheduler/reportScheduler.js';
import suggestionEngine from '../services/copilot/suggestionEngine.js';
import { initDiscoveryScheduler, stopDiscoveryScheduler } from './discovery/DiscoveryScheduler.js';
import { stopInsightGenerationJob } from '../scheduler/systemWatcherJob.js';
import { startInsightGenerationJob } from '../scheduler/systemWatcherJob.js';
import { startQaSweepScheduler, stopQaSweepScheduler } from '../services/qa/qaSweepScheduler.js';
import { getPrismaClient } from './prisma.js';
import { startDiagnosticsCleanup } from './diagnostics/diagnosticsCleanup.js';
import { cleanupStreamTokenRateLimitBuckets } from './streamTokenRateLimit.js';

/** @type {ReturnType<typeof setInterval> | null} */
let rateLimitCleanupInterval = null;
/** @type {ReturnType<typeof setInterval> | null} */
let orchestraMirrorInterval = null;
/** @type {ReturnType<typeof setInterval> | null} */
let deferredStorePipelineInterval = null;
/** @type {(() => void) | null} */
let diagnosticsCleanupStop = null;
let workersStarted = false;

/**
 * @param {{ prisma?: import('@prisma/client').PrismaClient }} [opts]
 */
export function startBackgroundWorkers(opts = {}) {
  if (workersStarted) {
    console.log('[CORE] Background workers already started — skipping duplicate startup');
    return;
  }
  workersStarted = true;

  try {
    startOfflineWatcher();
  } catch (e) {
    console.error('[CORE] startOfflineWatcher failed (non-fatal):', e?.message || e);
  }

  try {
    startSessionCleanup();
  } catch (e) {
    console.error('[CORE] startSessionCleanup failed (non-fatal):', e?.message || e);
  }

  try {
    startDeviceCleanupWorker();
  } catch (e) {
    console.error('[CORE] startDeviceCleanupWorker failed (non-fatal):', e?.message || e);
  }

  if (!rateLimitCleanupInterval) {
    rateLimitCleanupInterval = setInterval(() => {
      try {
        cleanupRateLimitStore();
      } catch (e) {
        console.warn('[CORE] cleanupRateLimitStore failed (non-fatal):', e?.message || e);
      }
      try {
        const removed = cleanupStreamTokenRateLimitBuckets();
        if (removed > 0 && process.env.NODE_ENV === 'development') {
          console.log(`[CORE] cleaned ${removed} stale stream-token rate limit buckets`);
        }
      } catch (e) {
        console.warn('[CORE] cleanupStreamTokenRateLimitBuckets failed (non-fatal):', e?.message || e);
      }
    }, 5 * 60 * 1000);
  }

  if (process.env.NODE_ENV !== 'test' && !orchestraMirrorInterval) {
    reconcileStaleOrchestraMirrors().catch((e) =>
      console.error('[CORE] reconcileStaleOrchestraMirrors (startup):', e?.message || e),
    );
    orchestraMirrorInterval = setInterval(() => {
      reconcileStaleOrchestraMirrors().catch((e) =>
        console.error('[CORE] reconcileStaleOrchestraMirrors:', e?.message || e),
      );
    }, 5 * 60 * 1000);
  }

  if (process.env.NODE_ENV !== 'test' && !deferredStorePipelineInterval) {
    const runOrphanResume = () =>
      resumeOrphanedDeferredStorePipelines(opts.prisma ?? getPrismaClient()).catch((e) =>
        console.error('[CORE] resumeOrphanedDeferredStorePipelines:', e?.message || e),
      );
    // Slight delay so DB/migrate bootstrap can finish before resuming long draft builds.
    setTimeout(() => {
      runOrphanResume();
    }, 15_000);
    deferredStorePipelineInterval = setInterval(runOrphanResume, 2 * 60 * 1000);
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      initReportScheduler();
    } catch (e) {
      console.error('[CORE] initReportScheduler failed (non-fatal):', e?.message || e);
    }
  }

  try {
    suggestionEngine.start();
  } catch (e) {
    console.error('[CORE] suggestionEngine.start failed (non-fatal):', e?.message || e);
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      initDiscoveryScheduler();
    } catch (e) {
      console.error('[CORE] initDiscoveryScheduler failed (non-fatal):', e?.message || e);
    }
  }

  if (process.env.NODE_ENV !== 'test' && process.env.INSIGHT_JOB_ENABLED === 'true') {
    try {
      startInsightGenerationJob();
      console.log('[Startup] Insight generation job started');
    } catch (e) {
      console.error('[CORE] startInsightGenerationJob failed (non-fatal):', e?.message || e);
    }
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      startQaSweepScheduler({ prisma: opts.prisma ?? getPrismaClient() });
    } catch (e) {
      console.error('[CORE] startQaSweepScheduler failed (non-fatal):', e?.message || e);
    }
  }

  if (process.env.NODE_ENV !== 'test' && !diagnosticsCleanupStop) {
    try {
      const { stop } = startDiagnosticsCleanup(60 * 60 * 1000);
      diagnosticsCleanupStop = stop;
    } catch (e) {
      console.error('[CORE] startDiagnosticsCleanup failed (non-fatal):', e?.message || e);
    }
  }
}

export function stopBackgroundWorkers() {
  workersStarted = false;

  try {
    stopOfflineWatcher();
  } catch {
    /* ignore */
  }
  try {
    stopSessionCleanup();
  } catch {
    /* ignore */
  }
  try {
    stopDeviceCleanupWorker();
  } catch {
    /* ignore */
  }
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = null;
  }
  if (orchestraMirrorInterval) {
    clearInterval(orchestraMirrorInterval);
    orchestraMirrorInterval = null;
  }
  if (deferredStorePipelineInterval) {
    clearInterval(deferredStorePipelineInterval);
    deferredStorePipelineInterval = null;
  }
  try {
    stopReportScheduler();
  } catch {
    /* ignore */
  }
  try {
    suggestionEngine.stop();
  } catch {
    /* ignore */
  }
  try {
    stopDiscoveryScheduler();
  } catch {
    /* ignore */
  }
  try {
    stopInsightGenerationJob();
  } catch {
    /* ignore */
  }
  try {
    stopQaSweepScheduler();
  } catch {
    /* ignore */
  }
  if (diagnosticsCleanupStop) {
    diagnosticsCleanupStop();
    diagnosticsCleanupStop = null;
  }
}

export function areBackgroundWorkersStarted() {
  return workersStarted;
}
