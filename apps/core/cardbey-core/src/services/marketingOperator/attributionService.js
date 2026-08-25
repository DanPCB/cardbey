/**
 * Marketing attribution — tracked destinations, touches, conversions.
 *
 * Attribution windows (constants):
 * - CLICK: 7 days
 * - VIEW: 1 day
 *
 * @see ATTRIBUTION_WINDOWS in constants.js
 */

import { createTrackedHandoff } from '../marketingOperations/trackedHandoff.js';
import {
  ATTRIBUTION_WINDOWS,
  CONVERSION_EVENTS,
  FUNNEL_STAGES,
  normalizeConversionEventType,
} from './constants.js';
import { marketingRepo } from './repository.js';

export { ATTRIBUTION_WINDOWS, CONVERSION_EVENTS, FUNNEL_STAGES };

/**
 * Build a tracked destination URL — shared Marketing Operations handoff helper.
 * @param {object} args
 */
export function createTrackedDestination(args) {
  return createTrackedHandoff({
    ...args,
    baseUrl: args.baseUrl || args.destination,
  });
}

/**
 * @param {object} input
 */
export async function recordTouch(input) {
  const touch = await marketingRepo.attributionTouch.create({
    campaignId: input.campaignId || null,
    contentId: input.contentId || null,
    channel: input.channel || null,
    source: input.source || null,
    placement: input.placement || null,
    creativeVersion: input.creativeVersion != null ? String(input.creativeVersion) : null,
    destinationUrl: input.destinationUrl || null,
    visitorKey: input.visitorKey || null,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    metadata: {
      ...(input.metadata || {}),
      windows: { ...ATTRIBUTION_WINDOWS },
    },
  });
  return { ok: true, touch };
}

/**
 * Associate a conversion event with an optional prior touch. Dedupes by dedupeKey when provided.
 * @param {object} input
 */
export async function associateConversion(input) {
  const eventType = normalizeConversionEventType(input.eventType);
  if (!eventType) {
    return {
      ok: false,
      error: 'invalid_eventType',
      allowed: Object.values(CONVERSION_EVENTS),
    };
  }

  const dedupeKey = input.dedupeKey ? String(input.dedupeKey) : null;
  if (dedupeKey) {
    const existing = await marketingRepo.conversion
      .findFirst({ where: { dedupeKey } })
      .catch(() => null);
    if (existing) {
      return { ok: true, conversion: existing, deduped: true, touchId: existing.touchId };
    }
  }

  let touchId = input.touchId || null;
  if (!touchId && input.visitorKey && input.campaignId) {
    const recent = await marketingRepo.attributionTouch.findFirst({
      where: {
        visitorKey: input.visitorKey,
        campaignId: input.campaignId,
      },
      orderBy: { occurredAt: 'desc' },
    }).catch(() => null);
    if (recent) {
      const ageMs = Date.now() - new Date(recent.occurredAt).getTime();
      const windowMs = ATTRIBUTION_WINDOWS.CLICK_DAYS * 24 * 60 * 60 * 1000;
      if (ageMs <= windowMs) touchId = recent.id;
    }
  }

  const conversion = await marketingRepo.conversion.create({
    campaignId: input.campaignId || null,
    touchId,
    eventType,
    visitorKey: input.visitorKey || null,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    metadata: input.metadata || null,
    simulated: input.simulated === true,
    dedupeKey,
  });

  return { ok: true, conversion, touchId };
}

/**
 * Create SIMULATED conversions for the full pilot funnel (testing only).
 * @param {string} campaignId
 * @param {{ visitorKey?: string, actorId?: string }} [opts]
 */
export async function simulateFunnelForPilot(campaignId, opts = {}) {
  if (!campaignId) return { ok: false, error: 'campaignId_required' };
  const visitorKey = opts.visitorKey || `sim_${campaignId}_${Date.now()}`;
  const touchRes = await recordTouch({
    campaignId,
    channel: 'facebook',
    source: 'simulate_funnel',
    visitorKey,
    metadata: { simulated: true },
  });

  const created = [];
  for (const stage of FUNNEL_STAGES) {
    const dedupeKey = `sim:${campaignId}:${visitorKey}:${stage.key}`;
    const res = await associateConversion({
      campaignId,
      eventType: stage.key,
      visitorKey,
      touchId: touchRes.touch?.id || null,
      simulated: true,
      dedupeKey,
      metadata: { simulated: true, source: 'simulateFunnelForPilot' },
    });
    if (res.ok) created.push(res.conversion);
  }

  return {
    ok: true,
    campaignId,
    visitorKey,
    conversions: created,
    note: 'SIMULATED conversions only — not first-party or Meta reach.',
  };
}

/**
 * Simulate a seven-day return conversion for a visitor.
 * @param {object} input
 */
export async function simulateSevenDayReturn(input = {}) {
  const campaignId = input.campaignId;
  if (!campaignId) return { ok: false, error: 'campaignId_required' };
  const visitorKey = input.visitorKey || `return_${Date.now()}`;
  const dedupeKey =
    input.dedupeKey || `sim:${campaignId}:${visitorKey}:${CONVERSION_EVENTS.SEVEN_DAY_RETURN}`;
  return associateConversion({
    campaignId,
    eventType: CONVERSION_EVENTS.SEVEN_DAY_RETURN,
    visitorKey,
    simulated: true,
    dedupeKey,
    metadata: { simulated: true, source: 'simulateSevenDayReturn' },
  });
}
