/**
 * QA Sweep Scheduler - runs QA sweep on cadence.
 * Disabled by default in prod; enable via QA_SWEEP_ENABLED=true.
 */

import { runQaSweep } from './runQaSweep.js';
import { getQaSweepEnabled, getQaSweepEveryMinutes } from './qaSweepConfig.js';

let intervalId = null;
let isRunning = false;

/**
 * @param {{ prisma: import('@prisma/client').PrismaClient, logger?: (msg: string, data?: object) => void }} opts
 */
export function startQaSweepScheduler({ prisma, logger = console.log.bind(console) }) {
  if (!getQaSweepEnabled()) {
    logger('[QaSweep] Scheduler disabled (QA_SWEEP_ENABLED not true)');
    return;
  }

  const everyMinutes = getQaSweepEveryMinutes();
  const intervalMs = everyMinutes * 60 * 1000;

  const run = async () => {
    if (isRunning) {
      logger('[QaSweep] Skipping run - previous still in progress');
      return;
    }
    isRunning = true;
    try {
      const result = await runQaSweep({ prisma, logger });
      logger('[QaSweep] Run complete', result);
    } catch (e) {
      logger('[QaSweep] Run failed', { err: e?.message });
    } finally {
      isRunning = false;
    }
  };

  run(); // initial run
  intervalId = setInterval(run, intervalMs);
  logger(`[QaSweep] ✅ Scheduler started (every ${everyMinutes}m)`);
}

export function stopQaSweepScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[QaSweep] Scheduler stopped');
  }
}
