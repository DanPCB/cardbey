/**
 * Shared Discovery Runtime — scheduled session orchestration.
 *
 * Owns: runnable gate, in-process running flag, optional multi-instance lock,
 * invoke pipeline.runAllActive, optional onComplete hook.
 *
 * Does NOT own: seed resolve, scrape, UnclaimedStore, PreBuilt, URI federation.
 */

import { assertDiscoveryPipeline } from './pipelineContract.js';

/**
 * @typedef {object} ScheduledSessionDeps
 * @property {import('./pipelineContract.js').DiscoveryPipeline} pipeline
 * @property {() => Promise<{ ok: boolean, reason?: string }>} isRunnable
 * @property {() => boolean} isInProcessRunning
 * @property {(running: boolean) => void} setInProcessRunning
 * @property {(summaries: unknown[]) => Promise<void> | void} [onComplete]
 * @property {(message: string) => void} [log]
 */

/**
 * Cron-equivalent tick. Behaviour-preserving relative to DiscoveryScheduler.onTick.
 *
 * @param {ScheduledSessionDeps} deps
 */
export async function runScheduledSession(deps) {
  assertDiscoveryPipeline(deps.pipeline);
  const log = deps.log || ((message) => console.log(message));

  const runnable = await deps.isRunnable();
  if (!runnable.ok) {
    log(`[Discovery] Skipping tick: ${runnable.reason}`);
    return { skipped: true, reason: runnable.reason || 'not_runnable' };
  }

  if (deps.isInProcessRunning()) {
    log('[Discovery] Already running, skipping tick');
    return { skipped: true, reason: 'already_running' };
  }

  if (typeof deps.pipeline.isLocked === 'function') {
    if (await deps.pipeline.isLocked()) {
      log('[Discovery] Discovery already running on another instance, skipping');
      return { skipped: true, reason: 'instance_lock' };
    }
  }

  deps.setInProcessRunning(true);
  try {
    log('[Discovery] Starting scheduled discovery run');
    const batchSummaries = await deps.pipeline.runAllActive('cron');
    const list = Array.isArray(batchSummaries) ? batchSummaries : [];
    if (list.length > 0) {
      if (deps.onComplete) {
        await deps.onComplete(list);
      }
    } else {
      log('[Discovery] Scheduled tick found no active seeds — nothing to crawl');
    }
    log(`[Discovery] Completed ${list.length} batch(es)`);
    return { skipped: false, summaries: list };
  } catch (error) {
    console.error('[Discovery] Batch failed:', error?.message || error);
    return { skipped: false, error };
  } finally {
    deps.setInProcessRunning(false);
  }
}
