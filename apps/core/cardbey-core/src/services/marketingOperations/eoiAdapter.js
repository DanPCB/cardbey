/**
 * Adapter: Global Live EOI completion → shared marketing attribution spine.
 * Does not change EOI ownership or response shape.
 * INVESTOR_DISCOVERY campaigns are not recorded as SME EOI_SUBMITTED.
 */

import { marketingRepo } from '../marketingOperator/repository.js';
import { recordCanonicalEvent } from './attributionSpine.js';
import { readCampaignTargetType } from './campaignContract.js';
import {
  allowsSmeLifecycle,
  CANONICAL_EVENTS,
  CHANNELS,
  TARGET_TYPES,
} from './constants.js';

async function resolveCampaignFromEoi(row) {
  const candidates = [row?.utmCampaign, row?.campaign].filter(Boolean).map(String);
  for (const key of candidates) {
    try {
      const campaign = await marketingRepo.campaign.findFirst({
        where: { OR: [{ id: key }, { name: key }] },
      });
      if (campaign) return campaign;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {object} row GlobalLiveEoiRegistration
 */
export async function ingestGlobalLiveEoi(row) {
  if (!row) return { ok: false, skipped: true, reason: 'no_row' };

  const campaign = await resolveCampaignFromEoi(row);
  const targetType = campaign ? readCampaignTargetType(campaign) : TARGET_TYPES.USER_ACQUISITION;
  const hasContext = Boolean(
    campaign || row.utmSource || row.utmCampaign || row.source || row.campaign,
  );
  if (!hasContext) {
    return { ok: false, skipped: true, reason: 'no_attribution_context' };
  }

  if (!allowsSmeLifecycle(targetType)) {
    return recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.CARDBEY_HANDOFF,
      campaignId: campaign?.id || row.utmCampaign || null,
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      channel: row.socialProvider || row.utmSource || CHANNELS.UNKNOWN,
      source: row.source || row.utmSource,
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      utmContent: row.utmContent,
      userId: null,
      anonymousId: row.id,
      visitorKey: row.id,
      correlationId: row.publicReference || row.id,
      dedupeKey: `investor_eoi_anon:${row.id}`,
      metadata: { eoiId: row.id, investorAnonymous: true, smeLifecycle: false },
    });
  }

  return recordCanonicalEvent({
    eventType: CANONICAL_EVENTS.EOI_SUBMITTED,
    campaignId: campaign?.id || row.utmCampaign || null,
    targetType: TARGET_TYPES.USER_ACQUISITION,
    channel: row.socialProvider || row.utmSource || CHANNELS.GLOBAL_LIVE,
    source: row.source || row.utmSource,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    utmContent: row.utmContent,
    userId: row.userId || null,
    storeId: row.storeId || null,
    visitorKey: row.userId || row.id,
    correlationId: row.publicReference || row.id,
    dedupeKey: `eoi_submitted:${row.id}`,
    metadata: { eoiId: row.id, pilotId: row.pilotId || null },
  });
}
