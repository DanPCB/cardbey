/**
 * Cloudflare Notifications webhook authenticity for Stream Live Input events.
 *
 * Docs:
 * - Live Input notifications: https://developers.cloudflare.com/stream/stream-live/webhooks/
 * - Notifications destinations: https://developers.cloudflare.com/notifications/get-started/configure-webhooks/
 *
 * Generic webhook destinations send the configured secret in the `cf-webhook-auth` header.
 * This is NOT the Stream video-library HMAC (`Webhook-Signature` / time.sig1).
 */

import crypto from 'node:crypto';
import { LIVE_MARKET_ERROR_CODES, liveMarketError } from '../domain.js';

/**
 * @param {unknown} headers
 * @returns {string}
 */
export function readCloudflareNotificationsAuthHeader(headers) {
  if (!headers || typeof headers !== 'object') return '';
  const h = /** @type {Record<string, unknown>} */ (headers);
  const raw =
    h['cf-webhook-auth'] ??
    h['Cf-Webhook-Auth'] ??
    h['CF-WEBHOOK-AUTH'] ??
    // Express lowercases headers
    h['cf-webhook-auth'];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

/**
 * Constant-time compare of Notifications destination secret.
 * @param {{
 *   headers: unknown,
 *   secret: string,
 * }} args
 * @returns {{ ok: true } | { ok: false, code: string, reason: string }}
 */
export function verifyCloudflareNotificationsWebhookAuth(args) {
  const secret = String(args.secret || '');
  if (!secret) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      reason: 'missing_secret',
    };
  }
  const provided = readCloudflareNotificationsAuthHeader(args.headers);
  if (!provided) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      reason: 'missing_auth_header',
    };
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      reason: 'bad_auth',
    };
  }
  return { ok: true };
}

/**
 * @param {Parameters<typeof verifyCloudflareNotificationsWebhookAuth>[0]} args
 */
export function assertCloudflareNotificationsWebhookAuth(args) {
  const result = verifyCloudflareNotificationsWebhookAuth(args);
  if (!result.ok) {
    throw liveMarketError(
      result.code || LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      'Cloudflare Notifications webhook auth invalid',
    );
  }
  return result;
}

/**
 * Normalize Live Input notification body without retaining raw text blobs.
 * @param {unknown} body
 */
export function normalizeCloudflareLiveInputNotification(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const data =
    /** @type {any} */ (payload).data && typeof /** @type {any} */ (payload).data === 'object'
      ? /** @type {any} */ (payload).data
      : {};
  const uid = String(data.input_id || /** @type {any} */ (payload).input_id || '').trim();
  const eventType = String(data.event_type || /** @type {any} */ (payload).event_type || '').trim();
  const updatedAt = String(data.updated_at || '').trim();
  const ts = Number(/** @type {any} */ (payload).ts);
  const errorCode =
    data.live_input_errored?.error?.code != null
      ? String(data.live_input_errored.error.code)
      : null;

  let mapped = 'unknown';
  if (eventType === 'live_input.connected') mapped = 'connected';
  else if (eventType === 'live_input.disconnected') mapped = 'disconnected';
  else if (eventType === 'live_input.errored') mapped = 'errored';

  return {
    uid,
    eventType,
    mapped,
    updatedAt: updatedAt || (Number.isFinite(ts) ? String(ts) : ''),
    errorCode,
    eventId: ['cf-live', uid || 'unknown', eventType || 'unknown', updatedAt || String(ts || '')].join(
      ':',
    ),
  };
}
