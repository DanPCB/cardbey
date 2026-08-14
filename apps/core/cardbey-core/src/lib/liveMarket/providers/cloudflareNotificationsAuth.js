import crypto from 'node:crypto';
import { LIVE_MARKET_ERROR_CODES, liveMarketError } from '../domain.js';

function readHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== target) continue;
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  }
  return '';
}

/**
 * @param {{ headers?: unknown, secret?: string | null }} args
 * @returns {{ ok: true } | { ok: false, code: string, reason: string }}
 */
export function verifyCloudflareNotificationsAuth(args = {}) {
  const secret = String(args.secret || '').trim();
  if (!secret) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      reason: 'missing_secret',
    };
  }
  const provided = readHeader(args.headers, 'cf-webhook-auth');
  if (!provided) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      reason: 'missing_header',
    };
  }
  const expectedBuffer = Buffer.from(secret, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      reason: 'bad_header',
    };
  }
  return { ok: true };
}

/**
 * @param {Parameters<typeof verifyCloudflareNotificationsAuth>[0]} args
 */
export function assertCloudflareNotificationsAuth(args = {}) {
  const result = verifyCloudflareNotificationsAuth(args);
  if (!result.ok) {
    throw liveMarketError(
      result.code || LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID,
      'Cloudflare notifications auth invalid',
    );
  }
  return result;
}
