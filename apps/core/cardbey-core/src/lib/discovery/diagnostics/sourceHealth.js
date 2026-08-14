/**
 * Derive per-source health from recent batch runs (not lifetime errorCount alone).
 */

import {
  HEALTH,
  RESULT_CODES,
  NON_RETRYABLE_CODES,
  operatorActionForCode,
  isRetryableCode,
} from './discoveryResultCodes.js';

/**
 * @param {object | null} batch parsed DiscoveryBatchRun row
 * @returns {{ code: string, message: string, retryable: boolean, skipReason: string | null } | null}
 */
export function extractBatchResult(batch) {
  if (!batch) return null;
  const snap = batch.configSnapshot && typeof batch.configSnapshot === 'object'
    ? batch.configSnapshot
    : null;
  const fromSnap = snap?.result;
  if (fromSnap && typeof fromSnap === 'object' && fromSnap.code) {
    return {
      code: String(fromSnap.code),
      message: String(fromSnap.message || ''),
      retryable: Boolean(fromSnap.retryable),
      skipReason: fromSnap.skipReason ? String(fromSnap.skipReason) : null,
    };
  }
  const log = Array.isArray(batch.errorLog) ? batch.errorLog : [];
  const withCode = log.find((e) => e && e.code);
  if (withCode) {
    return {
      code: String(withCode.code),
      message: String(withCode.message || withCode.error || ''),
      retryable: isRetryableCode(String(withCode.code)),
      skipReason: withCode.skipReason ? String(withCode.skipReason) : null,
    };
  }
  // Legacy shape: { error: 'PROVIDER_BLOCKED'|'CONFIG_ERROR'|..., detail }
  const legacy = log.find((e) => e && typeof e.error === 'string' && /^[A-Z_]+$/.test(e.error));
  if (legacy) {
    let code = String(legacy.error);
    if (code === 'RESOLVER_PARSE_ERROR') code = RESULT_CODES.PARSE_ERROR;
    if (code === 'OK') code = RESULT_CODES.SUCCESS;
    return {
      code,
      message: String(legacy.message || legacy.detail || legacy.error),
      retryable: isRetryableCode(code),
      skipReason: legacy.skipReason ? String(legacy.skipReason) : null,
    };
  }
  if (batch.status === 'completed' && (batch.created > 0 || batch.preBuilt > 0)) {
    return {
      code: RESULT_CODES.SUCCESS,
      message: `Created ${batch.created}`,
      retryable: false,
      skipReason: null,
    };
  }
  if (batch.status === 'completed' && batch.skipped > 0 && batch.failed === 0) {
    return {
      code: RESULT_CODES.SKIPPED,
      message: 'Skipped existing',
      retryable: false,
      skipReason: 'ALREADY_EXISTS',
    };
  }
  if (batch.status === 'failed' || batch.failed > 0) {
    const err = log[0]?.error || log[0]?.message || 'failed';
    return {
      code: RESULT_CODES.UPSTREAM_ERROR,
      message: String(err),
      retryable: true,
      skipReason: null,
    };
  }
  return null;
}

/**
 * @param {Array<object>} recentBatches newest-first
 */
export function deriveSourceHealth(recentBatches = []) {
  const recent = Array.isArray(recentBatches) ? recentBatches.slice(0, 8) : [];
  if (recent.length === 0) {
    return {
      health: HEALTH.UNKNOWN,
      lastResultCode: null,
      lastResultMessage: null,
      retryable: null,
      suggestedAction: 'No runs yet. Run Now or wait for schedule.',
      successCount: 0,
      failureCount: 0,
      lastSuccessfulAt: null,
      lastAttemptedAt: null,
    };
  }

  const results = recent.map((b) => ({
    batch: b,
    result: extractBatchResult(b),
  }));
  const last = results[0];
  const lastCode = last.result?.code || null;

  let successCount = 0;
  let failureCount = 0;
  let lastSuccessfulAt = null;
  for (const row of results) {
    const code = row.result?.code;
    if (code === RESULT_CODES.SUCCESS || code === RESULT_CODES.SKIPPED || code === RESULT_CODES.NO_RESULTS) {
      successCount += 1;
      if (!lastSuccessfulAt && (code === RESULT_CODES.SUCCESS || code === RESULT_CODES.SKIPPED)) {
        lastSuccessfulAt = row.batch.completedAt || row.batch.startedAt;
      }
    } else if (code && code !== RESULT_CODES.PARTIAL) {
      failureCount += 1;
    } else if (row.batch.status === 'failed') {
      failureCount += 1;
    } else if (row.batch.created > 0) {
      successCount += 1;
      if (!lastSuccessfulAt) lastSuccessfulAt = row.batch.completedAt || row.batch.startedAt;
    }
  }

  let health = HEALTH.UNKNOWN;
  if (lastCode === RESULT_CODES.PROVIDER_BLOCKED) health = HEALTH.BLOCKED;
  else if (lastCode === RESULT_CODES.CONFIG_ERROR || lastCode === RESULT_CODES.AUTH_ERROR || lastCode === RESULT_CODES.INVALID_SOURCE) {
    health = HEALTH.MISCONFIGURED;
  } else if (lastCode === RESULT_CODES.SUCCESS || lastCode === RESULT_CODES.SKIPPED) {
    health = failureCount > 0 ? HEALTH.DEGRADED : HEALTH.HEALTHY;
  } else if (lastCode === RESULT_CODES.NO_RESULTS) {
    health = HEALTH.DEGRADED;
  } else if (lastCode === RESULT_CODES.PARTIAL) {
    health = HEALTH.DEGRADED;
  } else if (lastCode && NON_RETRYABLE_CODES.has(lastCode)) {
    health = HEALTH.FAILING;
  } else if (failureCount >= Math.min(3, recent.length) && successCount === 0) {
    health = HEALTH.FAILING;
  } else if (failureCount > 0) {
    health = HEALTH.DEGRADED;
  } else {
    health = HEALTH.HEALTHY;
  }

  return {
    health,
    lastResultCode: lastCode,
    lastResultMessage: last.result?.message || null,
    retryable: last.result ? Boolean(last.result.retryable) : null,
    skipReason: last.result?.skipReason || null,
    suggestedAction: lastCode ? operatorActionForCode(lastCode) : 'No diagnosis yet.',
    successCount,
    failureCount,
    lastSuccessfulAt,
    lastAttemptedAt: last.batch.completedAt || last.batch.startedAt || null,
  };
}

/**
 * Whether cron should skip this seed to avoid burning quota.
 * Manual Run Now still allowed (caller decides).
 * @param {ReturnType<typeof deriveSourceHealth>} healthInfo
 * @param {string} triggeredBy
 */
export function shouldSkipCronForHealth(healthInfo, triggeredBy) {
  if (triggeredBy !== 'cron') return false;
  const code = healthInfo?.lastResultCode;
  if (!code) return false;
  return NON_RETRYABLE_CODES.has(code);
}
