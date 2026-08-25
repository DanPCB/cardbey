/**
 * Meta webhook verify + HMAC signature + idempotent ingest.
 * Requires raw body Buffer for signature verification (mounted like Stripe).
 * Fail-closed: never map engagements when verification is incomplete.
 */

import crypto from 'crypto';
import { Features } from '../../config/features.js';
import { ingestEngagementFromWebhook } from './engagementService.js';
import { marketingRepo } from './repository.js';
import { redactSecrets } from './audit.js';

export const WEBHOOK_VERIFICATION_NOT_CONFIGURED = 'WEBHOOK_VERIFICATION_NOT_CONFIGURED';

/**
 * Both app secret and verify token must be present for consume processing.
 */
export function isWebhookVerificationConfigured() {
  const secret = String(process.env.META_WEBHOOK_APP_SECRET || '').trim();
  const token = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  return Boolean(secret && token);
}

/**
 * GET hub.challenge verification.
 * @param {object} query
 */
export function verifyChallenge(query) {
  const mode = query['hub.mode'] || query.hub_mode;
  const token = query['hub.verify_token'] || query.hub_verify_token;
  const challenge = query['hub.challenge'] || query.hub_challenge;
  const expected = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();

  if (!expected) {
    return { ok: false, error: WEBHOOK_VERIFICATION_NOT_CONFIGURED };
  }

  if (mode === 'subscribe' && String(token) === expected) {
    return { ok: true, challenge: String(challenge ?? '') };
  }
  return { ok: false, error: 'verify_failed' };
}

/**
 * Verify x-hub-signature-256 (HMAC SHA256 of raw body with app secret).
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signatureHeader
 */
export function verifySignature(rawBody, signatureHeader) {
  const secret = String(process.env.META_WEBHOOK_APP_SECRET || '').trim();
  if (!secret) {
    return { ok: false, error: 'app_secret_missing', code: WEBHOOK_VERIFICATION_NOT_CONFIGURED };
  }
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { ok: false, error: 'signature_missing' };
  }
  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) {
    return { ok: false, error: 'signature_format' };
  }
  const provided = signatureHeader.slice(expectedPrefix.length);
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const digest = crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');

  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'signature_mismatch' };
  }
  return { ok: true };
}

function payloadHash(rawBody) {
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  return crypto.createHash('sha256').update(bodyBuf).digest('hex');
}

/**
 * Idempotent event ingest. Fast-ack caller should respond 200 before heavy work when possible;
 * this function itself is awaitable for tests.
 * @param {Buffer|string} rawBody
 * @param {object} [parsed]
 * @param {{ signatureVerified?: boolean }} [opts]
 */
export async function ingestWebhookEvent(rawBody, parsed = null, opts = {}) {
  const hash = payloadHash(rawBody);
  let body = parsed;
  if (!body) {
    try {
      body = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
    } catch {
      body = {};
    }
  }

  const eventId =
    body?.entry?.[0]?.id && body?.entry?.[0]?.time
      ? `${body.entry[0].id}:${body.entry[0].time}`
      : body?.object && hash
        ? `${body.object}:${hash.slice(0, 32)}`
        : hash;

  const existing = await marketingRepo.webhookEvent
    .findFirst({
      where: {
        OR: [
          { provider: 'facebook', eventId: String(eventId) },
          { provider: 'facebook', payloadHash: hash },
        ],
      },
    })
    .catch(() => null);

  if (existing) {
    return { ok: true, duplicate: true, event: existing };
  }

  const safePayload = redactSecrets({
    object: body?.object || null,
    entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
    topics: Array.isArray(body?.entry)
      ? body.entry.map((e) => ({ id: e?.id, changes: e?.changes?.length || 0 }))
      : [],
  });

  const event = await marketingRepo.webhookEvent.create({
    provider: 'facebook',
    eventId: String(eventId),
    topic: body?.object || null,
    payloadHash: hash,
    status: 'RECEIVED',
    payload: safePayload,
  });

  if (!Features.marketingOperator.webhookConsumeV1) {
    return { ok: true, duplicate: false, event, processed: false, reason: 'webhook_consume_disabled' };
  }

  // Fail-closed: never map untrusted payload when verification incomplete.
  if (!isWebhookVerificationConfigured() || opts.signatureVerified !== true) {
    const updated = await marketingRepo.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'REJECTED',
        error: WEBHOOK_VERIFICATION_NOT_CONFIGURED,
        processedAt: new Date(),
      },
    });
    return {
      ok: false,
      duplicate: false,
      event: updated,
      processed: false,
      code: WEBHOOK_VERIFICATION_NOT_CONFIGURED,
      error: WEBHOOK_VERIFICATION_NOT_CONFIGURED,
    };
  }

  try {
    const { supported: comments, ignored } = normalizeFacebookWebhookInteractions(body);
    for (const c of comments) {
      if (Features.marketingOperator.engagementInboxV1) {
        await ingestEngagementFromWebhook(c);
      }
    }
    const updated = await marketingRepo.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    return {
      ok: true,
      duplicate: false,
      event: updated,
      processed: true,
      supportedCount: comments.length,
      ignoredCount: ignored.length,
    };
  } catch (err) {
    const updated = await marketingRepo.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'FAILED', error: String(err?.message || err).slice(0, 500) },
    });
    return { ok: false, event: updated, error: 'process_failed' };
  }
}

function extractCommentLikeEvents(body) {
  return normalizeFacebookWebhookInteractions(body).supported;
}

/**
 * Parser/normalizer only. Does not persist. Ignores DMs, ads, groups.
 * @param {object} body
 * @returns {{ supported: object[], ignored: object[] }}
 */
export function normalizeFacebookWebhookInteractions(body) {
  const supported = [];
  const ignored = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    if (Array.isArray(entry?.messaging) && entry.messaging.length) {
      ignored.push({ reason: 'messaging_ignored', pageId: entry.id || null });
    }
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const field = String(change?.field || '');
      const value = change?.value || {};
      if (field === 'ads' || value.ad_id || value.adgroup_id) {
        ignored.push({ reason: 'ads_ignored', field });
        continue;
      }
      if (field && field !== 'feed' && value.item !== 'comment' && !value.comment_id && value.item !== 'mention') {
        ignored.push({ reason: 'unsupported_field', field, item: value.item || null });
        continue;
      }
      const item = String(value.item || '').toLowerCase();
      const isCommentLike =
        field === 'feed' ||
        item === 'comment' ||
        item === 'reply' ||
        item === 'mention' ||
        item === 'reaction' ||
        Boolean(value.comment_id);
      if (!isCommentLike) {
        ignored.push({ reason: 'unsupported_payload', field, item: value.item || null });
        continue;
      }
      let interactionType = 'comment';
      if (item === 'reply' || value.parent_id) interactionType = 'reply';
      else if (item === 'mention') interactionType = 'mention';
      else if (item === 'reaction' || item === 'like') interactionType = 'reaction';
      else if (item === 'comment' || value.comment_id) interactionType = 'comment';

      supported.push({
        pageId: entry?.id || null,
        accountId: entry?.id || null,
        externalId: value.comment_id || value.post_id || null,
        postId: value.post_id || value.parent_id || null,
        engagementType: value.item || interactionType,
        interactionType,
        actorExternalId: value.from?.id || null,
        authorName: value.from?.name || null,
        message: value.message || '',
        body: value.message || '',
        occurredAt: value.created_time ? new Date(Number(value.created_time) * 1000) : null,
      });
    }
  }
  return { supported, ignored };
}
