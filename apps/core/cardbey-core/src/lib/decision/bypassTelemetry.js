/**
 * P0 bypass telemetry — Phase 0 inventory. Every deprecated decider logs here before removal.
 */

import { Features } from '../../config/features.js';

/** @type {Map<string, number>} */
const bypassCounts = new Map();

export const INTAKE_BYPASS_IDS = {
  IMAGE_CHAT_CAMPAIGN_AUTOSUBMIT: 'BYPASS_IMAGE_CHAT_CAMPAIGN_AUTOSUBMIT',
  UPLOAD_ASK_ENFORCE: 'BYPASS_UPLOAD_ASK_ENFORCE',
  LEGACY_SMART_STORE_OCR: 'BYPASS_LEGACY_SMART_STORE_OCR',
  CAMPAIGN_ORCHESTRATION_PRE_GATE: 'BYPASS_CAMPAIGN_ORCHESTRATION_PRE_GATE',
  AGENT_LOOP_DIRECT_CHAT: 'BYPASS_AGENT_LOOP_DIRECT_CHAT',
  ATTACHMENT_ONLY_ASSET_INTENT: 'BYPASS_ATTACHMENT_ONLY_ASSET_INTENT',
  UPLOAD_PHASE_ROUTING: 'BYPASS_UPLOAD_PHASE_ROUTING',
};

/**
 * @param {string} bypassId
 * @param {Record<string, unknown>} [meta]
 */
export function recordIntakeBypass(bypassId, meta = {}) {
  const id = String(bypassId ?? '').trim();
  if (!id) return;
  bypassCounts.set(id, (bypassCounts.get(id) ?? 0) + 1);
  const payload = {
    event: 'intake_bypass',
    bypassId: id,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  if (process.env.NODE_ENV === 'development' || Features.bypasses.telemetryLog) {
    console.log('[intake/bypass]', JSON.stringify(payload));
  }
}

/** @internal tests */
export function resetIntakeBypassCountsForTests() {
  bypassCounts.clear();
}

/** @internal tests */
export function getIntakeBypassCount(bypassId) {
  return bypassCounts.get(bypassId) ?? 0;
}
