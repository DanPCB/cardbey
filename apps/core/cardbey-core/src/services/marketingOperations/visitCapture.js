/**
 * First-party attributed visit ingest (provider-neutral).
 * Public, unauthenticated. Writes CARDBEY_VISIT only when campaign/UTM/correlation context exists.
 */

import { Features } from '../../config/features.js';
import { classifyReferral } from '../../lib/attribution/classifyReferral.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import { extractAttrContext, recordCanonicalEvent } from './attributionSpine.js';
import { CANONICAL_EVENTS, isInvestorDiscovery } from './constants.js';

const VISIT_DEDUPE_MS = 30 * 60 * 1000;
const RETURN_AFTER_MS = 24 * 60 * 60 * 1000;

function sanitizePath(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      return `${u.pathname}`.slice(0, 300);
    }
  } catch {
    /* fall through */
  }
  if (!s.startsWith('/')) return `/${s}`.slice(0, 300);
  return s.slice(0, 300);
}

function hasVisitContext(ctx, req) {
  if (ctx.campaignId || ctx.contentId || ctx.correlationId || ctx.utmCampaign || ctx.source) {
    return true;
  }
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const query = req?.query && typeof req.query === 'object' ? req.query : {};
  const marketing =
    body.marketingAttribution && typeof body.marketingAttribution === 'object'
      ? body.marketingAttribution
      : {};
  const flag = body.cb_attr ?? query.cb_attr ?? marketing.cb_attr;
  return flag === '1' || flag === 1 || flag === true;
}

function visitBucket() {
  return Math.floor(Date.now() / VISIT_DEDUPE_MS);
}

/**
 * @param {import('express').Request} req
 */
export async function ingestFirstPartyVisit(req) {
  const extraAnonymous =
    req?.body?.anonymousId ||
    req?.body?.visitorKey ||
    req?.headers?.['x-cardbey-viewer-key'] ||
    req?.guestSessionId ||
    null;
  const ctx = extractAttrContext(req, {
    anonymousId: extraAnonymous,
    visitorKey: extraAnonymous,
  });
  if (!hasVisitContext(ctx, req)) {
    return { ok: true, skipped: true, reason: 'no_attribution_context' };
  }

  const destinationPath = sanitizePath(
    req?.body?.path || req?.body?.destination || req?.body?.destinationPath,
  );
  const visitor = String(ctx.anonymousId || ctx.visitorKey || extraAnonymous || '').trim() || null;
  const campaignKey = ctx.campaignId || ctx.utmCampaign || 'none';
  const dedupeKey = `cardbey_visit:${visitor || 'anon'}:${campaignKey}:${destinationPath || '/'}:${visitBucket()}`;

  const referrer =
    req?.headers?.referer ||
    req?.headers?.referrer ||
    req?.body?.referrer ||
    null;
  const referral =
    Features.marketingOperator?.attributionV1 === true
      ? classifyReferral(referrer, ctx.utmSource, ctx.utmMedium)
      : null;

  const visit = await recordCanonicalEvent({
    req,
    eventType: CANONICAL_EVENTS.CARDBEY_VISIT,
    anonymousId: visitor,
    visitorKey: visitor,
    destinationUrl: destinationPath,
    dedupeKey,
    metadata: {
      path: destinationPath,
      firstParty: true,
      investorAnonymous: isInvestorDiscovery(ctx.targetType),
      ...(referral
        ? {
            referralClass: referral.referralClass,
            aiEngine: referral.aiEngine,
            referralConfidence: referral.confidence,
            referrer: referrer ? String(referrer).slice(0, 500) : null,
          }
        : {}),
    },
  });

  let returned = { ok: true, skipped: true, reason: 'not_evaluated' };
  if (visit.ok && !visit.deduped && !visit.skipped) {
    returned = await maybeRecordUserReturned({ req, ctx, visitor });
  }

  return {
    ok: true,
    visit,
    returned,
    liveMeta: false,
  };
}

async function maybeRecordUserReturned({ req, ctx, visitor }) {
  if (!visitor || visitor === 'anonymous') {
    return { ok: true, skipped: true, reason: 'no_stable_anonymous_id' };
  }

  let prior = null;
  try {
    prior = await marketingRepo.conversion.findFirst({
      where: {
        eventType: { in: [CANONICAL_EVENTS.CARDBEY_VISIT, CANONICAL_EVENTS.LANDING_VISIT] },
        occurredAt: { lt: new Date(Date.now() - RETURN_AFTER_MS) },
        OR: [{ visitorKey: visitor }, { anonymousId: visitor }],
      },
      orderBy: { occurredAt: 'desc' },
    });
  } catch {
    return { ok: true, skipped: true, reason: 'prior_lookup_unavailable' };
  }

  if (!prior) {
    return { ok: true, skipped: true, reason: 'no_prior_attributed_visit' };
  }

  const day = new Date().toISOString().slice(0, 10);
  return recordCanonicalEvent({
    req,
    eventType: CANONICAL_EVENTS.USER_RETURNED,
    campaignId: ctx.campaignId || prior.campaignId,
    targetType: ctx.targetType || prior.targetType,
    channel: ctx.channel,
    provider: ctx.provider,
    source: ctx.source,
    anonymousId: visitor,
    visitorKey: visitor,
    correlationId: ctx.correlationId,
    dedupeKey: `user_returned:${visitor}:${day}`,
    metadata: {
      priorVisitId: prior.id,
      returnAfterHours: 24,
      firstParty: true,
    },
  });
}

export const VISIT_CAPTURE_WINDOWS = Object.freeze({
  dedupeMinutes: VISIT_DEDUPE_MS / 60000,
  returnAfterHours: RETURN_AFTER_MS / 3600000,
});
