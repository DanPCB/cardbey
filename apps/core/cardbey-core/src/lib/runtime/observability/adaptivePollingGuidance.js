/**
 * Phase 2.3-C — adaptive polling guidance with pollingMode.
 *
 * STREAM_PRIMARY : SSE healthy → poll rarely (stream carries updates)
 * POLL_FALLBACK  : SSE unhealthy/disconnected → resume normal polling
 * RECOVERY_MODE  : transient — SSE recently dropped, replay/catch-up window
 *
 * Read-only. Does not mutate runtime.
 */

import { isPerformerAdaptivePollingEnabled } from '../../broker/brokerFlags.js';
import { recordSseHealth, recordPollingMode } from './runtimeObservabilityMetrics.js';

const STREAM_PRIMARY_POLL_MS = 20_000;
const POLL_FALLBACK_MS = 4_000;
const RECOVERY_POLL_MS = 1_500;

/**
 * @param {{ sseHealthy?: boolean, lastSseEventAgeMs?: number|null, orchestrationActive?: boolean, terminal?: boolean }} input
 * @returns {{
 *   pollingMode: 'STREAM_PRIMARY'|'POLL_FALLBACK'|'RECOVERY_MODE',
 *   recommendedPollIntervalMs: number,
 *   preferSse: boolean,
 *   reason: string,
 *   executable: false,
 *   advisoryMode: 'read_only'
 * } | null}
 */
export function buildAdaptivePollingGuidance(input = {}) {
  if (!isPerformerAdaptivePollingEnabled()) return null;

  const sseHealthy = Boolean(input.sseHealthy);
  const lastAge = typeof input.lastSseEventAgeMs === 'number' ? input.lastSseEventAgeMs : null;
  const terminal = Boolean(input.terminal);
  const orchestrationActive = Boolean(input.orchestrationActive);

  recordSseHealth(sseHealthy);

  let pollingMode;
  let recommendedPollIntervalMs;
  let reason;

  if (sseHealthy) {
    // Recently dropped then recovered → brief recovery window for catch-up.
    if (lastAge != null && lastAge > 15_000 && lastAge <= 45_000) {
      pollingMode = 'RECOVERY_MODE';
      recommendedPollIntervalMs = RECOVERY_POLL_MS;
      reason = 'SSE recovering — short catch-up polling, then stream-primary.';
    } else {
      pollingMode = 'STREAM_PRIMARY';
      recommendedPollIntervalMs = terminal ? STREAM_PRIMARY_POLL_MS * 2 : STREAM_PRIMARY_POLL_MS;
      reason = orchestrationActive
        ? 'SSE healthy during orchestration — rely on stream; poll rarely as safety net.'
        : 'SSE healthy — stream-first; minimal polling.';
    }
  } else {
    pollingMode = 'POLL_FALLBACK';
    recommendedPollIntervalMs = orchestrationActive ? POLL_FALLBACK_MS : POLL_FALLBACK_MS * 2;
    reason = 'SSE unavailable — polling fallback active.';
  }

  recordPollingMode(pollingMode);

  return {
    pollingMode,
    recommendedPollIntervalMs,
    preferSse: true,
    reason,
    executable: false,
    advisoryMode: 'read_only',
  };
}
