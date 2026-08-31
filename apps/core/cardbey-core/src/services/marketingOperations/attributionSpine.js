/**
 * Canonical marketing attribution/event spine.
 * Writes MarketingConversion (+ optional touch). Never throws to product callers.
 *
 * Extra contract fields live in metadata always; top-level columns used when Prisma allows.
 */

import { Features } from '../../config/features.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import {
  allowsSmeLifecycle,
  CANONICAL_EVENTS,
  CHANNELS,
  isInvestorDiscovery,
  normalizeCanonicalEvent,
  resolveTargetType,
  SME_LIFECYCLE_EVENTS,
  TARGET_TYPES,
} from './constants.js';
import { readCampaignTargetType } from './campaignContract.js';

function spineEnabled() {
  return Features.marketingOperator?.v1 === true && Features.marketingOperator?.attributionV1 === true;
}

export function extractAttrContext(req, extra = {}) {
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const query = req?.query && typeof req.query === 'object' ? req.query : {};
  const marketing =
    body.marketingAttribution && typeof body.marketingAttribution === 'object'
      ? body.marketingAttribution
      : {};

  const campaignId =
    extra.campaignId ||
    marketing.campaignId ||
    body.campaignId ||
    query.campaignId ||
    query.utm_campaign ||
    extra.utmCampaign ||
    null;
  const contentId =
    extra.contentId ||
    marketing.contentId ||
    body.contentId ||
    query.contentId ||
    query.utm_content ||
    extra.utmContent ||
    null;
  const channel =
    extra.channel || marketing.channel || body.channel || query.channel || CHANNELS.FACEBOOK;
  const source =
    extra.source ||
    marketing.source ||
    body.source ||
    query.source ||
    query.utm_source ||
    extra.utmSource ||
    null;
  const correlationId =
    extra.correlationId ||
    marketing.correlationId ||
    body.correlationId ||
    query.correlationId ||
    null;

  return {
    campaignId: campaignId ? String(campaignId) : null,
    contentId: contentId ? String(contentId) : null,
    channel: channel ? String(channel) : null,
    provider: extra.provider ? String(extra.provider) : channel ? String(channel) : null,
    source: source ? String(source) : null,
    utmSource: extra.utmSource || query.utm_source || body.utmSource || marketing.utmSource || source || null,
    utmMedium: extra.utmMedium || query.utm_medium || body.utmMedium || marketing.utmMedium || null,
    utmCampaign:
      extra.utmCampaign || query.utm_campaign || body.utmCampaign || marketing.utmCampaign || campaignId || null,
    utmContent: extra.utmContent || query.utm_content || body.utmContent || marketing.utmContent || contentId || null,
    anonymousId: extra.anonymousId || marketing.anonymousId || body.anonymousId || query.anonymousId || null,
    userId: extra.userId || null,
    storeId: extra.storeId || null,
    correlationId: correlationId ? String(correlationId) : null,
    visitorKey:
      extra.visitorKey ||
      marketing.visitorKey ||
      body.visitorKey ||
      query.visitorKey ||
      extra.userId ||
      extra.anonymousId ||
      null,
    targetType: extra.targetType || marketing.targetType || body.targetType || null,
  };
}

async function resolveCampaignTargetType(campaignId) {
  if (!campaignId) return TARGET_TYPES.USER_ACQUISITION;
  try {
    const campaign = await marketingRepo.campaign.findFirst({
      where: {
        OR: [{ id: campaignId }, { name: campaignId }],
      },
    });
    if (!campaign) return TARGET_TYPES.USER_ACQUISITION;
    return readCampaignTargetType(campaign);
  } catch {
    return TARGET_TYPES.USER_ACQUISITION;
  }
}

function conversionRow(eventType, ctx, extra = {}) {
  const targetType = resolveTargetType(ctx.targetType);
  return {
    campaignId: ctx.campaignId || null,
    touchId: extra.touchId || null,
    eventType,
    visitorKey: ctx.visitorKey || null,
    occurredAt: extra.occurredAt ? new Date(extra.occurredAt) : new Date(),
    simulated: extra.simulated === true,
    dedupeKey: extra.dedupeKey || null,
    targetType,
    channel: ctx.channel || null,
    provider: ctx.provider || ctx.channel || null,
    contentId: ctx.contentId || null,
    source: ctx.source || null,
    utmSource: ctx.utmSource || null,
    utmMedium: ctx.utmMedium || null,
    utmCampaign: ctx.utmCampaign || null,
    utmContent: ctx.utmContent || null,
    anonymousId: ctx.anonymousId || null,
    userId: ctx.userId || null,
    storeId: ctx.storeId || null,
    correlationId: ctx.correlationId || null,
    metadata: {
      targetType,
      channel: ctx.channel || null,
      provider: ctx.provider || ctx.channel || null,
      contentId: ctx.contentId || null,
      source: ctx.source || null,
      utmSource: ctx.utmSource || null,
      utmMedium: ctx.utmMedium || null,
      utmCampaign: ctx.utmCampaign || null,
      utmContent: ctx.utmContent || null,
      anonymousId: ctx.anonymousId || null,
      userId: ctx.userId || null,
      storeId: ctx.storeId || null,
      correlationId: ctx.correlationId || null,
      investorAnonymous: isInvestorDiscovery(targetType),
      ...(extra.metadata || {}),
    },
  };
}

function stripUnknownConversionColumns(row) {
  const {
    targetType,
    channel,
    provider,
    contentId,
    source,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    anonymousId,
    userId,
    storeId,
    correlationId,
    ...rest
  } = row;
  return rest;
}

/**
 * @param {object} input
 */
export async function recordCanonicalEvent(input = {}) {
  if (!spineEnabled()) {
    return { ok: false, skipped: true, reason: 'attribution_disabled' };
  }

  const eventType = normalizeCanonicalEvent(input.eventType);
  if (!eventType) {
    return { ok: false, error: 'invalid_eventType' };
  }

  const ctx = extractAttrContext(input.req, input);
  if (!ctx.campaignId && !ctx.contentId && !ctx.correlationId && !ctx.utmCampaign && !ctx.source) {
    return { ok: false, skipped: true, reason: 'no_attribution_context' };
  }

  try {
    if (ctx.campaignId && !ctx.targetType) {
      ctx.targetType = await resolveCampaignTargetType(ctx.campaignId);
    } else {
      ctx.targetType = resolveTargetType(ctx.targetType);
    }

    const smeEvent = SME_LIFECYCLE_EVENTS.includes(eventType);
    if (smeEvent && !allowsSmeLifecycle(ctx.targetType)) {
      return {
        ok: true,
        skipped: true,
        reason: 'investor_sme_lifecycle_blocked',
        targetType: ctx.targetType,
        eventType,
      };
    }

    if (ctx.dedupeKey || input.dedupeKey) {
      const dedupeKey = String(input.dedupeKey || ctx.dedupeKey);
      const existing = await marketingRepo.conversion.findFirst({ where: { dedupeKey } }).catch(() => null);
      if (existing) {
        return { ok: true, conversion: existing, deduped: true };
      }
    }

    let touchId = input.touchId || null;
    if (!touchId && (ctx.campaignId || ctx.contentId)) {
      const touchRes = await marketingRepo.attributionTouch
        .create({
          campaignId: ctx.campaignId,
          contentId: ctx.contentId,
          channel: ctx.channel,
          source: ctx.source,
          destinationUrl: input.destinationUrl || null,
          visitorKey: ctx.visitorKey,
          metadata: { eventType, targetType: ctx.targetType },
        })
        .catch(() => null);
      touchId = touchRes?.id || null;
    }

    const row = conversionRow(eventType, ctx, { ...input, touchId, dedupeKey: input.dedupeKey || null });
    let conversion;
    try {
      conversion = await marketingRepo.conversion.create(row);
    } catch (err) {
      conversion = await marketingRepo.conversion.create(stripUnknownConversionColumns(row));
    }
    return { ok: true, conversion, eventType, targetType: ctx.targetType };
  } catch (err) {
    console.warn('[marketingOperations/spine] non-fatal', err?.message || err);
    return { ok: false, skipped: true, reason: 'error', message: err?.message };
  }
}

export async function tryRecordSignup(req, user) {
  return recordCanonicalEvent({
    req,
    eventType: CANONICAL_EVENTS.SIGNUP,
    userId: user?.id || null,
    visitorKey: user?.id || null,
    dedupeKey: user?.id ? `signup:${user.id}` : null,
  });
}

export async function tryRecordBusinessCreated({ req, userId, storeId } = {}) {
  return recordCanonicalEvent({
    req,
    eventType: CANONICAL_EVENTS.BUSINESS_CREATED,
    userId: userId || null,
    storeId: storeId || null,
    visitorKey: userId || null,
    dedupeKey: storeId ? `business_created:${storeId}` : null,
  });
}

export async function tryRecordBusinessClaimed({ req, userId, storeId, seedId } = {}) {
  return recordCanonicalEvent({
    req,
    eventType: CANONICAL_EVENTS.BUSINESS_CLAIMED,
    userId: userId || null,
    storeId: storeId || null,
    visitorKey: userId || null,
    dedupeKey: storeId || seedId ? `business_claimed:${storeId || seedId}` : null,
    metadata: { seedId: seedId || null },
  });
}

export async function tryRecordBusinessPublished({ req, userId, storeId } = {}) {
  return recordCanonicalEvent({
    req,
    eventType: CANONICAL_EVENTS.BUSINESS_PUBLISHED,
    userId: userId || null,
    storeId: storeId || null,
    visitorKey: userId || null,
    dedupeKey: storeId ? `business_published:${storeId}` : null,
  });
}

export async function tryRecordContentPublished({ campaignId, contentId, channel, userId } = {}) {
  return recordCanonicalEvent({
    eventType: CANONICAL_EVENTS.CONTENT_PUBLISHED,
    campaignId,
    contentId,
    channel: channel || CHANNELS.FACEBOOK,
    userId,
    dedupeKey: contentId ? `content_published:${contentId}` : null,
  });
}

export { CANONICAL_EVENTS };
