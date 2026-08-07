/**
 * DiscoveryScheduler — meta-scheduler with live config reload from DB.
 * Runs inside the API web process (ROLE !== worker).
 */

import cron from 'node-cron';
import { runAllActive, isDiscoveryLocked } from './DiscoveryBatchRunner.js';
import * as DiscoveryConfigService from './DiscoveryConfigService.js';
import { appendDiscoveryReport } from '../../scheduler/reportScheduler.js';

let currentTask = null;
let currentCron = null;
let metaInterval = null;
let isRunning = false;
let isStarted = false;

export function isDiscoveryRunning() {
  return isRunning;
}

async function onTick() {
  const runnable = await DiscoveryConfigService.isRunnable();
  if (!runnable.ok) {
    console.log(`[Discovery] Skipping tick: ${runnable.reason}`);
    return;
  }

  if (isRunning) {
    console.log('[Discovery] Already running, skipping tick');
    return;
  }

  if (await isDiscoveryLocked()) {
    console.log('[Discovery] Discovery already running on another instance, skipping');
    return;
  }

  isRunning = true;
  try {
    console.log('[Discovery] Starting scheduled discovery run');
    const batchSummaries = await runAllActive('cron');
    if (batchSummaries.length > 0) {
      await appendDiscoveryReport(batchSummaries);
    } else {
      console.log('[Discovery] Scheduled tick found no active seeds — nothing to crawl');
    }
    console.log(`[Discovery] Completed ${batchSummaries.length} batch(es)`);
  } catch (error) {
    console.error('[Discovery] Batch failed:', error?.message || error);
  } finally {
    isRunning = false;
  }
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
