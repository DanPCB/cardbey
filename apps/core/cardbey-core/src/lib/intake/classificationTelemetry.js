/**
 * Classification metrics for misroute detection — structured stdout + optional DB persist.
 */

import { emitIntakeV2TelemetryAsync } from './intakeTelemetry.js';
import { getDomainForIntent } from './intentDomains.js';

/**
 * @param {object} ctx
 * @param {object} result
 */
export function logClassificationMetrics(ctx, result) {
  const userMessage = String(ctx.userMessage ?? '').slice(0, 500);
  const source =
    result._classificationSource ??
    result._fastPath ??
    (result._downgraded ? 'validation' : 'llm');

  emitIntakeV2TelemetryAsync({
    message: userMessage,
    query: userMessage,
    storeId: ctx.storeId ?? null,
    userId: ctx.userId ?? null,
    sessionId: ctx.sessionId ?? null,
    traceId: ctx.traceId ?? null,
    executionPath: result.executionPath ?? null,
    tool: result.tool ?? null,
    confidence: result.confidence ?? null,
    downgraded: Boolean(result._downgraded),
    downgradeReason: result._downgradedReason ?? null,
    intentFamily: getDomainForIntent(userMessage),
    intentSubtype: source,
    destinationTool: result._rejectedTool ?? null,
    shadow: false,
    result: 'classified',
  });
}
