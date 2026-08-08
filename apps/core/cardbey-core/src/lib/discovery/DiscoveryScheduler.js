/**
 * DiscoveryScheduler — meta-scheduler with live config reload from DB.
 * Runs inside the API web process (ROLE !== worker).
 *
 * Phase 1: cron registration stays here; tick body goes through Shared Discovery
 * Runtime + the registered Business Discovery Pipeline (zero behaviour change).
 */

import cron from 'node-cron';
import * as DiscoveryConfigService from './DiscoveryConfigService.js';
import { appendDiscoveryReport } from '../../scheduler/reportScheduler.js';
import { runScheduledSession } from './runtime/SharedDiscoveryRuntime.js';
import { businessDiscoveryPipeline } from './pipelines/business/BusinessDiscoveryPipeline.js';

let currentTask = null;
let currentCron = null;
let metaInterval = null;
let isRunning = false;
let isStarted = false;

export function isDiscoveryRunning() {
  return isRunning;
}

async function onTick() {
  await runScheduledSession({
    pipeline: businessDiscoveryPipeline,
    isRunnable: () => DiscoveryConfigService.isRunnable(),
    isInProcessRunning: () => isRunning,
    setInProcessRunning: (running) => {
      isRunning = running;
    },
    onComplete: async (batchSummaries) => {
      await appendDiscoveryReport(batchSummaries);
    },
  });
}

async function applySchedule() {
  const config = await DiscoveryConfigService.getConfig();

  if (!config.enabled) {
    if (currentTask) {
      currentTask.stop();
      currentTask = null;
      currentCron = null;
    }
    console.log('[Discovery] Scheduler disabled');
    return;
  }

  const cronExpr = config.cronExpression?.trim() || '0 */6 * * *';
  if (!cron.validate(cronExpr)) {
    console.error(`[Discovery] Invalid cronExpression in config: ${cronExpr}`);
    return;
  }

  if (cronExpr === currentCron && currentTask) {
    return;
  }

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  currentCron = cronExpr;
  currentTask = cron.schedule(cronExpr, () => {
    onTick().catch((error) => {
      console.error('[Discovery] Unhandled scheduler error:', error);
    });
  }, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log(`[Discovery] Scheduled: ${cronExpr}`);
}

/**
 * Start meta-scheduler (always safe to call — config DB drives enabled state).
 */
export function startDiscoveryScheduler() {
  if (isStarted) {
    return;
  }
  isStarted = true;

  applySchedule().catch((error) => {
    console.error('[Discovery] applySchedule failed:', error?.message || error);
  });

  metaInterval = setInterval(() => {
    applySchedule().catch((error) => {
      console.error('[Discovery] applySchedule failed:', error?.message || error);
    });
  }, 5 * 60 * 1000);

  console.log('[Discovery] Meta-scheduler started (config reload every 5m)');
}

/** @deprecated Use startDiscoveryScheduler */
export function initDiscoveryScheduler() {
  startDiscoveryScheduler();
}

export function reloadSchedule() {
  return applySchedule();
}

/** Spec alias */
export function reloadDiscoverySchedule() {
  return applySchedule();
}

export function stopDiscoveryScheduler() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    currentCron = null;
  }
  if (metaInterval) {
    clearInterval(metaInterval);
    metaInterval = null;
  }
  isStarted = false;
  console.log('[Discovery] Scheduler stopped');
}

export { onTick as runDiscoveryTick };
