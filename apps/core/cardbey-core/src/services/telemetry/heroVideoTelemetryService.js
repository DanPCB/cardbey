/**
 * Persist dashboard hero video telemetry events.
 */

import { getPrismaClient } from '../../lib/prisma.js';

export const HERO_VIDEO_TELEMETRY_EVENTS = new Set([
  'upload.start',
  'upload.response',
  'verify.attempt',
  'verify.failed',
  'verify.succeeded',
  'playback.error',
  'playback.recovered',
]);

const MAX_URL_LEN = 500;
const MAX_STORAGE_KEY_LEN = 500;
const MAX_ENV_LEN = 32;

/**
 * @param {unknown} value
 * @param {number} maxLen
 * @returns {string | null}
 */
function trimOptionalString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseOptionalInt(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive S3/local storage key from a media URL when client omits storageKey.
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function deriveStorageKeyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const pathname = trimmed.startsWith('http')
      ? new URL(trimmed).pathname
      : trimmed.split('?')[0]?.split('#')[0] || trimmed;
    const mediaMatch = /\/(media\/[^/]+)$/.exec(pathname);
    if (mediaMatch) return mediaMatch[1];
    const uploadsMatch = /\/uploads\/(media\/[^/]+)$/.exec(pathname);
    if (uploadsMatch) return uploadsMatch[1];
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} body
 * @returns {import('@prisma/client').Prisma.TelemetryHeroVideoCreateInput | null}
 */
export function parseHeroVideoTelemetryBody(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const eventType = typeof b.event === 'string' ? b.event.trim() : '';
  if (!HERO_VIDEO_TELEMETRY_EVENTS.has(eventType)) return null;

  const url = trimOptionalString(b.url, MAX_URL_LEN);
  const storageKey =
    trimOptionalString(b.storageKey, MAX_STORAGE_KEY_LEN) || deriveStorageKeyFromUrl(url);

  let clientTs = null;
  if (typeof b.ts === 'number' && Number.isFinite(b.ts) && b.ts > 0) {
    clientTs = new Date(b.ts);
  }

  return {
    eventType,
    url,
    storageKey,
    attemptNumber: parseOptionalInt(b.attempt),
    httpStatus: parseOptionalInt(b.status),
    durationMs: parseOptionalInt(b.durationMs),
    errorCode: parseOptionalInt(b.errorCode),
    environment: trimOptionalString(b.environment, MAX_ENV_LEN),
    clientTs,
  };
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {import('@prisma/client').Prisma.TelemetryHeroVideoCreateInput} data
 * @param {{ userId?: string | null }} [opts]
 */
export async function recordHeroVideoTelemetry(prisma, data, opts = {}) {
  const userId = typeof opts.userId === 'string' && opts.userId.trim() ? opts.userId.trim() : null;
  return prisma.telemetryHeroVideo.create({
    data: {
      ...data,
      userId,
    },
  });
}

/**
 * Log verify failure patterns for ops visibility.
 * @param {import('@prisma/client').TelemetryHeroVideo} row
 */
export function logHeroVideoTelemetrySideEffects(row) {
  if (row.eventType === 'verify.failed') {
    const key = row.storageKey || row.url || 'unknown';
    console.warn(
      `[HeroVideo] Verify failed for ${key} after ${row.attemptNumber ?? '?'} attempts (env=${row.environment ?? 'unknown'})`,
    );
  }
}

export async function getPrismaForHeroVideoTelemetry() {
  return getPrismaClient();
}
