/**
 * Cloudflare Stream — server-only configuration (RTMPS pilot).
 * Never log or export secret values. Never expose via VITE_*.
 */

/**
 * @typedef {object} CloudflareStreamConfig
 * @property {string} accountId
 * @property {string} apiToken
 * @property {string | null} customerCode
 * @property {string | null} webhookSecret Stream video-library HMAC secret (not Live Input Notifications)
 * @property {string | null} notificationsWebhookAuth Cloudflare Notifications `cf-webhook-auth` secret
 * @property {string[]} allowedOrigins
 * @property {number} requestTimeoutMs
 * @property {number} readRetryCount
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, config: CloudflareStreamConfig } | { ok: false, reason: string }}
 */
export function readCloudflareStreamConfig(env = process.env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = String(env.CLOUDFLARE_STREAM_API_TOKEN || '').trim();
  const customerCode = String(env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '').trim() || null;
  const webhookSecret = String(env.CLOUDFLARE_STREAM_WEBHOOK_SECRET || '').trim() || null;
  const notificationsWebhookAuth =
    String(env.CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH || '').trim() || null;

  if (!accountId || !apiToken) {
    return { ok: false, reason: 'missing_account_or_token' };
  }

  const timeoutRaw = Number(env.CLOUDFLARE_STREAM_REQUEST_TIMEOUT_MS);
  const requestTimeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1000 && timeoutRaw <= 60000
      ? timeoutRaw
      : 15000;

  const retryRaw = Number(env.CLOUDFLARE_STREAM_READ_RETRY_COUNT);
  const readRetryCount =
    Number.isFinite(retryRaw) && retryRaw >= 0 && retryRaw <= 3 ? Math.floor(retryRaw) : 1;

  const allowedOrigins = String(env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ok: true,
    config: {
      accountId,
      apiToken,
      customerCode,
      webhookSecret,
      notificationsWebhookAuth,
      allowedOrigins,
      requestTimeoutMs,
      readRetryCount,
    },
  };
}

/**
 * True when env asks for Cloudflare Stream (RTMPS pilot).
 * Does NOT require WebRTC. Does not validate secrets (use readCloudflareStreamConfig).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{
 *   liveMarketV1?: boolean,
 *   broadcastV1?: boolean,
 *   cloudflareStreamV1?: boolean,
 * }} [flags]
 */
export function isCloudflareStreamProviderSelected(env = process.env, flags = {}) {
  const provider = String(env.LIVE_VIDEO_PROVIDER || '')
    .trim()
    .toLowerCase();
  if (provider !== 'cloudflare') return false;
  if (!flags.liveMarketV1) return false;
  if (!flags.broadcastV1) return false;
  if (!flags.cloudflareStreamV1) return false;
  return true;
}

/** Least-privilege token scopes recommended for the pilot. */
export const CLOUDFLARE_STREAM_TOKEN_PERMISSIONS_DOC = Object.freeze([
  'Account.Stream:Edit',
  'Account.Stream:Read',
]);
