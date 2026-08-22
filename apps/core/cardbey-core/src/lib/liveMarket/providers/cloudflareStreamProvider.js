/**
 * Cloudflare Stream LiveVideoProvider adapter (experimental Slice A).
 *
 * Official contracts:
 * - Live inputs API: https://developers.cloudflare.com/api/resources/stream/subresources/live_inputs/
 * - WebRTC WHIP/WHEP (beta): https://developers.cloudflare.com/stream/webrtc-beta/ (2026-08-13: recording not supported)
 *
 * Resource strategy: one live input per Cardbey session.
 * providerExternalRef must store only the Cloudflare live-input UID (never WHIP/WHEP URLs).
 *
 * Sensitive: prepareSession returns whipPublishUrl / whepPlaybackUrl only on an internal
 * sensitiveCapabilities object for a future authorized credentials endpoint — not for logs/DTOs.
 */

import { LIVE_MARKET_ERROR_CODES, liveMarketError } from '../domain.js';
import { redactCloudflareSecrets, safeCloudflareErrorMessage } from './cloudflareStreamRedact.js';
import { assertCloudflareStreamWebhookSignature } from './cloudflareWebhookVerify.js';

/**
 * @typedef {import('./cloudflareStreamConfig.js').CloudflareStreamConfig} CloudflareStreamConfig
 */

/**
 * @typedef {object} CloudflareSensitiveCapabilities
 * @property {string} whipPublishUrl Sensitive WHIP publish capability — do not persist/log
 * @property {string} whepPlaybackUrl Internal WHEP playback URL — Slice A only; not public
 */

/**
 * @typedef {import('../providers.js').PreparedVideoSession & {
 *   sensitiveCapabilities?: CloudflareSensitiveCapabilities,
 * }} CloudflarePreparedSession
 */

/**
 * @param {number} status
 * @param {string} [fallback]
 */
function mapHttpStatusToCode(status, fallback = LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE) {
  if (status === 401 || status === 403) return LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED;
  if (status === 404) return LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND;
  if (status === 429) return LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE;
  if (status >= 500) return LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE;
  if (status >= 400) return LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED;
  return fallback;
}

/**
 * @param {unknown} result
 * @returns {{
 *   uid: string,
 *   status: string | null,
 *   enabled: boolean | null,
 *   whipPublishUrl: string | null,
 *   whepPlaybackUrl: string | null,
 * }}
 */
export function normalizeCloudflareLiveInput(result) {
  const row = result && typeof result === 'object' ? result : {};
  const uid = String(row.uid || '').trim();
  const webRTC = row.webRTC && typeof row.webRTC === 'object' ? row.webRTC : {};
  const webRTCPlayback =
    row.webRTCPlayback && typeof row.webRTCPlayback === 'object' ? row.webRTCPlayback : {};
  return {
    uid,
    status: row.status == null ? null : String(row.status),
    enabled: typeof row.enabled === 'boolean' ? row.enabled : null,
    whipPublishUrl: webRTC.url ? String(webRTC.url) : null,
    whepPlaybackUrl: webRTCPlayback.url ? String(webRTCPlayback.url) : null,
  };
}

/**
 * Map Cloudflare live-input status to provider-neutral VideoSessionState.status.
 * @param {{ status: string | null, enabled: boolean | null, uid: string }} normalized
 * @param {string} sessionId
 */
export function mapLiveInputToVideoSessionState(normalized, sessionId) {
  const statusRaw = String(normalized.status || '').toLowerCase();
  let status = 'prepared';
  if (normalized.enabled === false) status = 'ended';
  else if (statusRaw === 'connected') status = 'live';
  else if (statusRaw === 'disconnected' || statusRaw === 'reconnecting') status = 'prepared';
  else if (!normalized.uid) status = 'unknown';
  return {
    sessionId: String(sessionId || ''),
    status,
    externalRef: normalized.uid || undefined,
  };
}

export class CloudflareStreamLiveVideoProvider {
  /** @type {string} */
  name = 'cloudflare_stream';

  /** Experimental WebRTC transport — still beta per Cloudflare docs. */
  experimental = true;

  /** Slice A: adapter may be selected; owner prepare/start capabilities stay locked. */
  unlocksOwnerPrepareStart = false;

  /** @type {CloudflareStreamConfig} */
  #config;

  /** @type {typeof fetch} */
  #fetch;

  /** @type {Map<string, string>} sessionId → live input uid */
  #sessionToUid = new Map();

  /**
   * @param {{
   *   config: CloudflareStreamConfig,
   *   fetchImpl?: typeof fetch,
   * }} args
   */
  constructor(args) {
    if (!args?.config?.accountId || !args?.config?.apiToken) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
        'Cloudflare Stream configuration incomplete',
      );
    }
    this.#config = args.config;
    this.#fetch = args.fetchImpl || globalThis.fetch.bind(globalThis);
  }

  #secrets() {
    return { apiToken: this.#config.apiToken, webhookSecret: this.#config.webhookSecret };
  }

  #apiBase() {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.#config.accountId)}/stream/live_inputs`;
  }

  /**
   * @param {string} pathSuffix
   * @param {{ method?: string, body?: object | null, retryReads?: boolean }} [opts]
   */
  async #request(pathSuffix, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    const isSafeRead = method === 'GET' || method === 'HEAD';
    const retryReads = opts.retryReads !== false && isSafeRead;
    const maxAttempts = retryReads ? 1 + (this.#config.readRetryCount || 0) : 1;

    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
      try {
        const res = await this.#fetch(`${this.#apiBase()}${pathSuffix}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.#config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: opts.body != null ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });
        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        if (!res.ok) {
          const code = mapHttpStatusToCode(res.status);
          const msg = safeCloudflareErrorMessage(
            `Cloudflare Stream HTTP ${res.status}`,
            this.#secrets(),
          );
          const err = liveMarketError(code, msg, {
            httpStatus: res.status,
            // Never attach raw Cloudflare body (may contain URLs/secrets)
            provider: 'cloudflare_stream',
          });
          // Retry only safe reads on 429/5xx
          if (isSafeRead && retryReads && (res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
            lastErr = err;
            continue;
          }
          throw err;
        }
        return json;
      } catch (err) {
        if (err?.code && String(err.code).startsWith('LIVE_')) throw err;
        const aborted = err?.name === 'AbortError';
        const mapped = liveMarketError(
          aborted
            ? LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE
            : LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE,
          safeCloudflareErrorMessage(
            aborted ? 'Cloudflare Stream request timed out' : err,
            this.#secrets(),
          ),
          { provider: 'cloudflare_stream', timeout: aborted },
        );
        if (isSafeRead && retryReads && attempt < maxAttempts) {
          lastErr = mapped;
          continue;
        }
        throw mapped;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr || liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE,
      'Cloudflare Stream request failed',
    );
  }

  /**
   * @param {import('../providers.js').PrepareVideoSessionInput} input
   * @returns {Promise<CloudflarePreparedSession>}
   */
  async prepareSession(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const storeId = String(input?.storeId || '').trim();
    if (!sessionId || !storeId) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED,
        'sessionId and storeId are required',
      );
    }

    // Recording mode is set off: WebRTC beta docs (2026-08-13) state recording is not supported.
    // Do not claim or enable recording in Slice A.
    const body = {
      meta: {
        name: String(input?.title || `cardbey-live-${sessionId}`).slice(0, 120),
        cardbeySessionId: sessionId,
        cardbeyStoreId: storeId,
      },
      recording: {
        mode: 'off',
      },
      // Prefer low-latency path is separate from WebRTC; leave default.
    };

    let json;
    try {
      json = await this.#request('', { method: 'POST', body, retryReads: false });
    } catch (err) {
      if (err?.code === LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED) throw err;
      if (err?.code && String(err.code).startsWith('LIVE_')) {
        throw liveMarketError(
          LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED,
          safeCloudflareErrorMessage(err, this.#secrets()),
          { provider: 'cloudflare_stream', causeCode: err.code },
        );
      }
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED,
        safeCloudflareErrorMessage(err, this.#secrets()),
        { provider: 'cloudflare_stream' },
      );
    }

    const normalized = normalizeCloudflareLiveInput(json?.result);
    if (!normalized.uid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED,
        'Cloudflare Stream did not return a live input uid',
        { provider: 'cloudflare_stream' },
      );
    }
    if (!normalized.whipPublishUrl || !normalized.whepPlaybackUrl) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED,
        'Cloudflare Stream live input missing WebRTC WHIP/WHEP URLs',
        { provider: 'cloudflare_stream' },
      );
    }

    this.#sessionToUid.set(sessionId, normalized.uid);

    /** @type {CloudflarePreparedSession} */
    const prepared = {
      sessionId,
      status: 'prepared',
      // Persistable correlation id only — never the WHIP capability
      externalRef: normalized.uid,
      sensitiveCapabilities: {
        whipPublishUrl: normalized.whipPublishUrl,
        whepPlaybackUrl: normalized.whepPlaybackUrl,
      },
    };
    return prepared;
  }

  /**
   * Slice A: start is a no-op state inspect — does not mark LIVE from owner click.
   * Authoritative LIVE requires connected status via reconciliation (Slice B).
   * @param {import('../providers.js').StartVideoSessionInput} input
   */
  async startSession(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const state = await this.getSessionState({ sessionId });
    if (state.status === 'unknown' && !state.externalRef) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input not found for session',
        { provider: 'cloudflare_stream' },
      );
    }
    // Never promote to live here — return prepared/idle until connected evidence exists.
    if (state.status === 'live') return state;
    return {
      sessionId,
      status: 'prepared',
      externalRef: state.externalRef,
    };
  }

  /**
   * Disable then delete the live input when possible (revokes WHIP capability).
   * @param {import('../providers.js').EndVideoSessionInput} input
   */
  async endSession(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      this.#sessionToUid.get(sessionId) ||
      String(input?.externalRef || '').trim() ||
      null;

    if (!uid) {
      return { sessionId, status: 'ended' };
    }

    // Best-effort disable (PUT enabled:false) then DELETE. Mutations are not retried.
    try {
      await this.#request(`/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        body: { enabled: false },
        retryReads: false,
      });
    } catch (err) {
      if (err?.code !== LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND) {
        // Continue to delete attempt; disable failure is non-fatal if delete succeeds
        void redactCloudflareSecrets(err?.message, this.#secrets());
      }
    }

    try {
      await this.#request(`/${encodeURIComponent(uid)}`, {
        method: 'DELETE',
        retryReads: false,
      });
    } catch (err) {
      if (err?.code !== LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND) {
        throw liveMarketError(
          LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE,
          safeCloudflareErrorMessage(err, this.#secrets()),
          { provider: 'cloudflare_stream' },
        );
      }
    }

    this.#sessionToUid.delete(sessionId);
    return {
      sessionId,
      status: 'ended',
      externalRef: uid,
    };
  }

  /**
   * @param {import('../providers.js').GetVideoSessionStateInput & { externalRef?: string }} input
   */
  async getSessionState(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      String(input?.externalRef || '').trim() ||
      this.#sessionToUid.get(sessionId) ||
      '';
    if (!uid) {
      return { sessionId, status: 'idle' };
    }

    try {
      const json = await this.#request(`/${encodeURIComponent(uid)}`, {
        method: 'GET',
        retryReads: true,
      });
      const normalized = normalizeCloudflareLiveInput(json?.result);
      this.#sessionToUid.set(sessionId, normalized.uid || uid);
      return mapLiveInputToVideoSessionState(
        { ...normalized, uid: normalized.uid || uid },
        sessionId,
      );
    } catch (err) {
      if (err?.code === LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND) {
        return { sessionId, status: 'unknown', externalRef: uid };
      }
      throw err;
    }
  }

  /**
   * Verifies webhook signature only. Does not drive lifecycle in Slice A.
   * @param {import('../providers.js').VerifyWebhookInput} input
   */
  async verifyWebhook(input) {
    const secret = this.#config.webhookSecret;
    if (!secret) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
        'Cloudflare Stream webhook secret is not configured',
        { provider: 'cloudflare_stream' },
      );
    }
    const headers = input?.headers && typeof input.headers === 'object' ? input.headers : {};
    const signatureHeader =
      headers['Webhook-Signature'] ||
      headers['webhook-signature'] ||
      headers['WEBHOOK-SIGNATURE'];
    const rawBody =
      typeof input?.rawBody === 'string'
        ? input.rawBody
        : Buffer.isBuffer(input?.rawBody)
          ? input.rawBody
          : typeof input?.body === 'string'
            ? input.body
            : JSON.stringify(input?.body || {});

    assertCloudflareStreamWebhookSignature({
      rawBody,
      signatureHeader,
      secret,
    });

    let body = input?.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const payload = body && typeof body === 'object' ? body : {};
    const uid = String(payload.uid || payload.liveInputUid || payload.input?.uid || '').trim();
    const sessionId =
      String(payload.meta?.cardbeySessionId || payload.cardbeySessionId || '').trim() ||
      [...this.#sessionToUid.entries()].find(([, v]) => v === uid)?.[0] ||
      '';

    return {
      eventId: String(payload.uid || payload.id || `cf-${Date.now()}`),
      sessionId,
      type: String(payload.status?.state || payload.state || payload.type || 'stream.notification'),
      // Sanitized — no nested URLs
      payload: {
        uid: uid || undefined,
        readyToStream: Boolean(payload.readyToStream),
        status: payload.status?.state ? String(payload.status.state) : undefined,
      },
    };
  }
}

/**
 * @param {{
 *   config: CloudflareStreamConfig,
 *   fetchImpl?: typeof fetch,
 * }} args
 */
export function createCloudflareStreamLiveVideoProvider(args) {
  return new CloudflareStreamLiveVideoProvider(args);
}
