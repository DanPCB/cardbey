/**
 * Cloudflare Stream webhook signature verification (internal utility only — Slice A).
 * Spec: https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 *
 * Header: Webhook-Signature: time=<unix>,sig1=<hex>
 * Source string: `${time}.${rawBody}` HMAC-SHA256 with webhook secret, hex compare.
 *
 * No HTTP route is mounted in Slice A. WebRTC publisher-connected events are insufficient
 * for authoritative LIVE — Slice B must poll/reconcile live-input status.
 */

import crypto from 'node:crypto';
import { LIVE_MARKET_ERROR_CODES, liveMarketError } from '../domain.js';

const MAX_SKEW_SECONDS = 5 * 60;

/**
 * @param {string | undefined | null} header
 * @returns {{ time: string, sig1: string } | null}
 */
export function parseCloudflareWebhookSignatureHeader(header) {
  const raw = String(header || '').trim();
  if (!raw) return null;
  /** @type {Record<string, string>} */
  const parts = {};
  for (const segment of raw.split(',')) {
    const idx = segment.indexOf('=');
    if (idx <= 0) continue;
    const key = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (key && value) parts[key] = value;
  }
  if (!parts.time || !parts.sig1) return null;
  return { time: parts.time, sig1: parts.sig1 };
}

/**
 * @param {{
 *   rawBody: string | Buffer,
 *   signatureHeader: string | undefined | null,
 *   secret: string,
 *   nowSeconds?: number,
 *   maxSkewSeconds?: number,
 * }} args
 * @returns {{ ok: true, time: number } | { ok: false, code: string, reason: string }}
 */
export function verifyCloudflareStreamWebhookSignature(args) {
  const secret = String(args.secret || '');
  if (!secret) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID, reason: 'missing_secret' };
  }
  const parsed = parseCloudflareWebhookSignatureHeader(args.signatureHeader);
  if (!parsed) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID, reason: 'missing_signature' };
  }
  const time = Number(parsed.time);
  if (!Number.isFinite(time)) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID, reason: 'invalid_time' };
  }
  const now = Number.isFinite(args.nowSeconds) ? Number(args.nowSeconds) : Math.floor(Date.now() / 1000);
  const skew = Number.isFinite(args.maxSkewSeconds) ? Number(args.maxSkewSeconds) : MAX_SKEW_SECONDS;
  if (Math.abs(now - time) > skew) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID, reason: 'timestamp_skew' };
  }

  const body =
    typeof args.rawBody === 'string'
      ? args.rawBody
      : Buffer.isBuffer(args.rawBody)
        ? args.rawBody.toString('utf8')
        : '';
  const source = `${parsed.time}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(source, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(parsed.sig1), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID, reason: 'bad_signature' };
  }
  return { ok: true, time };
}

/**
 * Throws a bounded Live Market error when verification fails (for adapter verifyWebhook).
 * @param {Parameters<typeof verifyCloudflareStreamWebhookSignature>[0]} args
 */
export function assertCloudflareStreamWebhookSignature(args) {
  const result = verifyCloudflareStreamWebhookSignature(args);
  if (!result.ok) {
    throw liveMarketError(
      result.code || LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      'Cloudflare Stream webhook signature invalid',
    );
  }
  return result;
}
