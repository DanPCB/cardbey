/**
 * Cloudflare Stream — server-only configuration (Slice A).
 * Evaluated only when Live Market Cloudflare/WebRTC flags select the provider.
 * Never log or export secret values.
 */

/**
 * @typedef {object} CloudflareStreamConfig
 * @property {string} accountId
 * @property {string} apiToken
 * @property {string | null} webhookSecret
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
  const webhookSecret = String(env.CLOUDFLARE_STREAM_WEBHOOK_SECRET || '').trim() || null;

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

  return {
    ok: true,
    config: {
      accountId,
      apiToken,
      webhookSecret,
      requestTimeoutMs,
      readRetryCount,
    },
  };
}

/**
 * True when env asks for Cloudflare and Slice A experimental flags are all on.
 * Does not validate secrets (use readCloudflareStreamConfig for that).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{
 *   liveMarketV1?: boolean,
 *   broadcastV1?: boolean,
 *   cloudflareStreamV1?: boolean,
 *   cloudflareWebRtcV1?: boolean,
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
  if (!flags.cloudflareWebRtcV1) return false;
  return true;
}

/** Least-privilege token scopes recommended for the pilot (see Cloudflare Stream API docs). */
export const CLOUDFLARE_STREAM_TOKEN_PERMISSIONS_DOC = Object.freeze([
  'Account.Stream:Edit', // create/update/delete live inputs
  'Account.Stream:Read', // retrieve live input state
]);
