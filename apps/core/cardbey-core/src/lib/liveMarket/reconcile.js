/**
 * Live Market provider reconciliation + Cloudflare Live Input Notifications webhook handling.
 *
 * Webhook authenticity: Cloudflare Notifications `cf-webhook-auth` (NOT Stream video-library HMAC).
 * If notifications auth secret is missing, webhook route stays inactive; reconciliation is authority.
 */

import { getPrismaClient } from '../prisma.js';
import Features from '../../config/features.js';
import {
  LIVE_MARKET_AUDIT_REASONS,
  LIVE_MARKET_ERROR_CODES,
  liveMarketError,
} from './domain.js';
import { appendLiveMarketAudit } from './audit.js';
import { resolveLiveVideoProvider } from './providers.js';
import {
  assertCloudflareNotificationsWebhookAuth,
  normalizeCloudflareLiveInputNotification,
} from './providers/cloudflareNotificationsAuth.js';
import {
  confirmProviderConnected,
  confirmProviderDisconnected,
  findSessionByProviderExternalRef,
} from './service.js';

/** @type {Map<string, number>} eventId → expiry ms */
const seenEvents = new Map();
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

let reconcileLockUntil = 0;

function rememberEvent(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return false;
  const now = Date.now();
  for (const [k, exp] of seenEvents) {
    if (exp <= now) seenEvents.delete(k);
  }
  if (seenEvents.has(id)) return false;
  seenEvents.set(id, now + EVENT_TTL_MS);
  return true;
}

export function isCloudflareLiveWebhookRouteActive(env = process.env) {
  if (!Features.liveMarket.broadcastV1 || !Features.liveMarket.cloudflareStreamV1) return false;
  const auth = String(env.CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH || '').trim();
  return Boolean(auth);
}

/**
 * Handle Live Input notification. Always returns a generic ack shape for HTTP.
 * Does not reveal whether an input id exists.
 */
export async function handleCloudflareLiveInputWebhook({
  prisma,
  headers,
  body,
  env = process.env,
} = {}) {
  if (!isCloudflareLiveWebhookRouteActive(env)) {
    throw liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'Cloudflare Live Input webhook is not active',
    );
  }

  assertCloudflareNotificationsWebhookAuth({
    headers,
    secret: String(env.CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH || ''),
  });

  const normalized = normalizeCloudflareLiveInputNotification(body);
  if (!normalized.uid || !normalized.eventType) {
    throw liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      'malformed live input notification',
    );
  }

  if (!rememberEvent(normalized.eventId)) {
    return { ok: true, duplicate: true };
  }

  const db = prisma || getPrismaClient();
  const session = await findSessionByProviderExternalRef({
    prisma: db,
    providerExternalRef: normalized.uid,
  });

  // Unknown input: ack without leaking existence
  if (!session) {
    await appendLiveMarketAudit({
      prisma: db,
      entityType: 'LiveMarketProviderEvent',
      entityId: normalized.uid.slice(0, 24),
      action: 'provider_event_unknown_input',
      reason: LIVE_MARKET_AUDIT_REASONS.LIVE_PROVIDER_RECONCILED,
      metadata: {
        provider: 'cloudflare_stream',
        eventType: normalized.eventType,
        // no raw body
      },
    });
    return { ok: true };
  }

  if (normalized.mapped === 'connected') {
    await confirmProviderConnected({
      prisma: db,
      session,
      source: 'webhook',
      providerInputUid: normalized.uid,
    });
  } else if (normalized.mapped === 'disconnected') {
    await confirmProviderDisconnected({
      prisma: db,
      session,
      source: 'webhook',
      providerInputUid: normalized.uid,
    });
  } else if (normalized.mapped === 'errored') {
    await confirmProviderDisconnected({
      prisma: db,
      session,
      source: 'webhook',
      providerInputUid: normalized.uid,
      errorCode: normalized.errorCode || 'PROVIDER_ERRORED',
    });
  }

  return { ok: true };
}

/**
 * Bounded reconciler — polls prepared/connecting/live/ending sessions only.
 * Never marks LIVE from schedule time alone.
 */
export async function reconcileLiveProviderSessions({
  prisma,
  videoProvider,
  limit = 20,
  maxProviderCalls = 20,
} = {}) {
  const now = Date.now();
  if (now < reconcileLockUntil) {
    return { ok: true, skipped: true, reason: 'locked' };
  }
  reconcileLockUntil = now + 15_000;

  const db = prisma || getPrismaClient();
  const provider = resolveLiveVideoProvider({ provider: videoProvider });
  if (provider.name === 'not_configured') {
    return { ok: true, scanned: 0, updated: 0, providerCalls: 0 };
  }

  const sessions = await db.liveMarketSession.findMany({
    where: {
      state: { in: ['READY', 'CONNECTING', 'LIVE', 'ENDING'] },
      providerExternalRef: { not: null },
    },
    take: Math.min(Math.max(Number(limit) || 20, 1), 50),
    orderBy: { updatedAt: 'asc' },
  });

  let providerCalls = 0;
  let updated = 0;

  for (const session of sessions) {
    if (providerCalls >= maxProviderCalls) break;
    providerCalls += 1;
    let state;
    try {
      state = await provider.getSessionState({
        sessionId: session.id,
        externalRef: session.providerExternalRef,
      });
    } catch {
      continue;
    }

    if (state.status === 'live' && session.state === 'CONNECTING') {
      await confirmProviderConnected({
        prisma: db,
        session,
        source: 'reconcile',
        providerName: provider.name,
        providerInputUid: session.providerExternalRef,
      });
      updated += 1;
      await appendLiveMarketAudit({
        prisma: db,
        entityType: 'LiveMarketSession',
        entityId: session.id,
        action: 'provider_reconciled',
        fromStatus: 'CONNECTING',
        toStatus: 'LIVE',
        reason: LIVE_MARKET_AUDIT_REASONS.LIVE_PROVIDER_RECONCILED,
        metadata: { storeId: session.storeId, provider: provider.name, transition: 'connected' },
      });
    } else if (
      (state.status === 'ended' || state.status === 'prepared' || state.status === 'failed') &&
      ['LIVE', 'ENDING'].includes(session.state)
    ) {
      await confirmProviderDisconnected({
        prisma: db,
        session,
        source: 'reconcile',
        providerName: provider.name,
        providerInputUid: session.providerExternalRef,
        errorCode: state.status === 'failed' ? 'PROVIDER_FAILED' : null,
      });
      updated += 1;
      await appendLiveMarketAudit({
        prisma: db,
        entityType: 'LiveMarketSession',
        entityId: session.id,
        action: 'provider_reconciled',
        fromStatus: session.state,
        toStatus: 'ENDED',
        reason: LIVE_MARKET_AUDIT_REASONS.LIVE_PROVIDER_RECONCILED,
        metadata: { storeId: session.storeId, provider: provider.name, transition: 'disconnected' },
      });
    }
  }

  return {
    ok: true,
    scanned: sessions.length,
    updated,
    providerCalls,
  };
}

/** Test helper */
export function __resetLiveReconcileStateForTests() {
  seenEvents.clear();
  reconcileLockUntil = 0;
}
