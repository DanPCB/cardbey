/**
 * Attach health + last result diagnostics to seed rows for admin API.
 */

import { prisma } from '../../prisma.js';
import { deriveSourceHealth, extractBatchResult } from './sourceHealth.js';
import { operatorActionForCode } from './discoveryResultCodes.js';

function parseBatch(row) {
  let configSnapshot = null;
  let errorLog = null;
  try {
    configSnapshot = row.configSnapshot ? JSON.parse(row.configSnapshot) : null;
  } catch { /* ignore */ }
  try {
    errorLog = row.errorLog ? JSON.parse(row.errorLog) : null;
  } catch { /* ignore */ }
  return { ...row, configSnapshot, errorLog };
}

/**
 * @param {object[]} seeds
 */
export async function enrichSeedsWithDiagnostics(seeds) {
  if (!Array.isArray(seeds) || seeds.length === 0) return [];

  const ids = seeds.map((s) => s.id);
  const batches = await prisma.discoveryBatchRun.findMany({
    where: { seedSourceId: { in: ids } },
    orderBy: { startedAt: 'desc' },
    take: Math.min(ids.length * 8, 200),
  });

  const bySeed = new Map();
  for (const raw of batches) {
    const row = parseBatch(raw);
    const key = row.seedSourceId;
    if (!key) continue;
    if (!bySeed.has(key)) bySeed.set(key, []);
    const list = bySeed.get(key);
    if (list.length < 8) list.push(row);
  }

  return seeds.map((seed) => {
    const recent = bySeed.get(seed.id) || [];
    const healthInfo = deriveSourceHealth(recent);
    const lastBatch = recent[0] || null;
    const lastResult = extractBatchResult(lastBatch);

    return {
      ...seed,
      health: healthInfo.health,
      lastResultCode: healthInfo.lastResultCode,
      lastResultMessage: healthInfo.lastResultMessage,
      lastResultRetryable: healthInfo.retryable,
      lastSkipReason: healthInfo.skipReason || null,
      suggestedAction: healthInfo.suggestedAction,
      recentSuccessCount: healthInfo.successCount,
      recentFailureCount: healthInfo.failureCount,
      lastSuccessfulAt: healthInfo.lastSuccessfulAt,
      lastAttemptedAt: healthInfo.lastAttemptedAt,
      lastBatchId: lastBatch?.id || null,
      diagnostics: {
        health: healthInfo.health,
        lastResult: lastResult
          ? {
              code: lastResult.code,
              message: lastResult.message,
              retryable: lastResult.retryable,
              skipReason: lastResult.skipReason,
              suggestedAction: operatorActionForCode(lastResult.code),
            }
          : null,
        recentRuns: recent.map((b) => ({
          id: b.id,
          startedAt: b.startedAt,
          completedAt: b.completedAt,
          status: b.status,
          discovered: b.discovered,
          created: b.created,
          skipped: b.skipped,
          failed: b.failed,
          result: extractBatchResult(b),
        })),
      },
    };
  });
}

/**
 * Enrich a parsed batch row with result summary for Run History.
 * @param {object} batch parseBatchRow output
 */
export function enrichBatchWithResult(batch) {
  const result = extractBatchResult(batch);
  return {
    ...batch,
    resultCode: result?.code || null,
    resultMessage: result?.message || null,
    resultRetryable: result ? Boolean(result.retryable) : null,
    skipReason: result?.skipReason || null,
    suggestedAction: result?.code ? operatorActionForCode(result.code) : null,
  };
}
