/**
 * Trigger for opportunity_inference: nightly or signal-threshold.
 * Stores last-run per store in OpportunityInferenceRun to avoid re-running too frequently.
 */

import { executeTask } from '../api/insightsOrchestrator.js';

const DEFAULT_MIN_SIGNALS = 50;

/**
 * Get number of IntentSignal rows for store since last inference run.
 * @param {object} prisma
 * @param {string} storeId
 * @returns {Promise<number>}
 */
export async function getSignalsSinceLastRun(prisma, storeId) {
  const run = await prisma.opportunityInferenceRun.findUnique({
    where: { storeId },
    select: { lastRunAt: true },
  });
  const since = run?.lastRunAt ?? new Date(0);
  return prisma.intentSignal.count({
    where: { storeId, createdAt: { gt: since } },
  });
}

/**
 * True if we should run inference: no previous run or signals since last run >= minSignals.
 * @param {object} prisma
 * @param {string} storeId
 * @param {{ minSignals?: number }} [opts]
 */
export async function shouldRunBySignalThreshold(prisma, storeId, opts = {}) {
  const minSignals = opts.minSignals ?? DEFAULT_MIN_SIGNALS;
  const count = await getSignalsSinceLastRun(prisma, storeId);
  return count >= minSignals;
}

/**
 * Run opportunity_inference for a store and record last run on success.
 * Call from nightly cron or after signal ingestion when shouldRunBySignalThreshold is true.
 * @param {object} prisma
 * @param {string} storeId
 * @param {{ tenantKey?: string, signalSummary?: string, windowDays?: number }} [opts]
 * @returns {Promise<object>} Result of runOpportunityInference (or { skipped, reason }).
 */
export async function runAndRecord(prisma, storeId, opts = {}) {
  const result = await executeTask(
    {
      entryPoint: 'opportunity_inference',
      request: {
        storeId,
        tenantKey: opts.tenantKey ?? storeId,
        signalSummary: opts.signalSummary,
        windowDays: opts.windowDays,
      },
    },
    { prisma }
  );
  if (!result.skipped && result.created != null) {
    await prisma.opportunityInferenceRun.upsert({
      where: { storeId },
      create: { storeId, lastRunAt: new Date() },
      update: { lastRunAt: new Date() },
    });
  }
  return result;
}
