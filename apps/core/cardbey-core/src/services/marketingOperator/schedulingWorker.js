/**
 * Durable mock scheduler for MarketingPublication rows.
 * Claims due SCHEDULED pubs, publishes via getPublishingProvider() (mock unless live).
 */

import { Features } from '../../config/features.js';
import { appendMarketingAudit } from './audit.js';
import { CONTENT_STATES, WORKER_BASE_BACKOFF_MS, WORKER_LOCK_MS, WORKER_MAX_RETRIES } from './constants.js';
import { getPublishingProvider } from './publishing/index.js';
import { marketingRepo } from './repository.js';

function workerId() {
  return process.env.MARKETING_WORKER_ID || `worker_${process.pid}`;
}

function backoffMs(retryCount) {
  const exp = Math.min(WORKER_MAX_RETRIES, Math.max(0, retryCount || 0));
  return WORKER_BASE_BACKOFF_MS * 2 ** exp;
}

/**
 * Atomically claim a publication if unlocked or lock expired.
 * @param {object} pub
 * @param {string} claimer
 */
async function tryClaim(pub, claimer) {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + WORKER_LOCK_MS);
  const where = {
    id: pub.id,
    status: CONTENT_STATES.SCHEDULED,
    OR: [{ claimedAt: null }, { lockExpiresAt: null }, { lockExpiresAt: { lte: now } }],
  };

  const updated = await marketingRepo.publication.updateMany({
    where,
    data: {
      claimedAt: now,
      claimedBy: claimer,
      lockExpiresAt,
      status: CONTENT_STATES.PUBLISHING,
    },
  });

  return (updated?.count || 0) > 0;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.force] admin/run-cycle force (bypass autoScheduleV1 in non-prod or when allowed)
 * @param {number} [opts.limit]
 * @param {string} [opts.actorId]
 */
export async function processDueMarketingPublications(opts = {}) {
  if (!Features.marketingOperator.v1) {
    return { ok: false, skipped: true, reason: 'marketing_operator_disabled', processed: 0 };
  }

  const force = opts.force === true;
  const allowForce =
    force &&
    (process.env.NODE_ENV !== 'production' ||
      String(process.env.MARKETING_PILOT_ALLOW_FORCE_WORKER || '').toLowerCase() === 'true');

  if (!Features.marketingOperator.autoScheduleV1 && !allowForce) {
    return { ok: true, skipped: true, reason: 'auto_schedule_disabled', processed: 0 };
  }

  const now = new Date();
  const claimer = opts.actorId || workerId();
  const limit = Math.min(Number(opts.limit) || 10, 50);

  let candidates = [];
  try {
    candidates = await marketingRepo.publication.findMany({
      where: {
        status: CONTENT_STATES.SCHEDULED,
        scheduledAt: { lte: now },
        OR: [{ claimedAt: null }, { lockExpiresAt: null }, { lockExpiresAt: { lte: now } }],
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      include: { campaign: true, content: true },
    });
  } catch (err) {
    return { ok: false, error: 'query_failed', message: err?.message, processed: 0 };
  }

  const results = [];
  // Always use factory — mock unless livePublishingV1 + facebookProviderV1.
  const provider = getPublishingProvider();

  for (const pub of candidates) {
    if (pub.campaign?.status === CONTENT_STATES.PAUSED || pub.campaign?.status === CONTENT_STATES.ARCHIVED) {
      results.push({ id: pub.id, skipped: true, reason: 'campaign_paused_or_archived' });
      continue;
    }

    // Idempotent: already published under same key
    if (pub.externalPostId && pub.status === CONTENT_STATES.PUBLISHED) {
      results.push({ id: pub.id, skipped: true, reason: 'already_published' });
      continue;
    }

    const claimed = await tryClaim(pub, claimer);
    if (!claimed) {
      results.push({ id: pub.id, skipped: true, reason: 'claim_failed' });
      continue;
    }

    try {
      const result = await provider.publish({
        contentId: pub.contentId,
        pageId: pub.pageId || process.env.CARDBEY_FACEBOOK_PAGE_ID || null,
        body: pub.content?.body || '',
        idempotencyKey: pub.idempotencyKey,
      });

      if (result.ok) {
        const updated = await marketingRepo.publication.update({
          where: { id: pub.id },
          data: {
            status: CONTENT_STATES.PUBLISHED,
            externalPostId: result.externalPostId || null,
            publishedUrl: result.publishedUrl || null,
            publishedAt: new Date(),
            failureClass: null,
            lastError: null,
            claimedAt: null,
            claimedBy: null,
            lockExpiresAt: null,
            responseMeta: { ...(result.meta || {}), worker: true, provider: provider.name },
          },
        });
        if (pub.contentId) {
          await marketingRepo.content.update({
            where: { id: pub.contentId },
            data: { status: CONTENT_STATES.PUBLISHED },
          }).catch(() => null);
        }
        await appendMarketingAudit({
          entityType: 'MarketingPublication',
          entityId: pub.id,
          action: 'worker_publish',
          toStatus: CONTENT_STATES.PUBLISHED,
          actorId: claimer,
          campaignId: pub.campaignId,
          metadata: { provider: provider.name, idempotencyKey: pub.idempotencyKey, mock: provider.name === 'mock' },
          createOperatorRun: true,
          runType: 'worker_cycle',
        });
        results.push({ id: pub.id, ok: true, publication: updated });
      } else {
        const retryCount = (pub.retryCount || 0) + 1;
        const giveUp = retryCount >= WORKER_MAX_RETRIES;
        const nextSchedule = new Date(Date.now() + backoffMs(retryCount));
        await marketingRepo.publication.update({
          where: { id: pub.id },
          data: {
            status: giveUp ? CONTENT_STATES.FAILED : CONTENT_STATES.SCHEDULED,
            retryCount,
            lastError: String(result.message || result.code || 'publish_failed').slice(0, 500),
            failureClass: result.code || 'PUBLISH_FAILED',
            claimedAt: null,
            claimedBy: null,
            lockExpiresAt: null,
            scheduledAt: giveUp ? pub.scheduledAt : nextSchedule,
            responseMeta: { ...(result.meta || {}), worker: true },
          },
        });
        await appendMarketingAudit({
          entityType: 'MarketingPublication',
          entityId: pub.id,
          action: giveUp ? 'worker_publish_failed' : 'worker_publish_retry',
          toStatus: giveUp ? CONTENT_STATES.FAILED : CONTENT_STATES.SCHEDULED,
          actorId: claimer,
          campaignId: pub.campaignId,
          metadata: { retryCount, code: result.code },
        });
        results.push({ id: pub.id, ok: false, retryCount, giveUp });
      }
    } catch (err) {
      const retryCount = (pub.retryCount || 0) + 1;
      await marketingRepo.publication.update({
        where: { id: pub.id },
        data: {
          status: CONTENT_STATES.SCHEDULED,
          retryCount,
          lastError: String(err?.message || err).slice(0, 500),
          claimedAt: null,
          claimedBy: null,
          lockExpiresAt: null,
          scheduledAt: new Date(Date.now() + backoffMs(retryCount)),
        },
      }).catch(() => null);
      results.push({ id: pub.id, ok: false, error: String(err?.message || err) });
    }
  }

  return {
    ok: true,
    processed: results.filter((r) => r.ok === true).length,
    results,
    provider: provider.name,
    forced: allowForce,
  };
}

/**
 * Admin-triggered deterministic one cycle (mock-safe).
 */
export async function runMarketingWorkerCycle(opts = {}) {
  return processDueMarketingPublications({ ...opts, force: true });
}
