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
 * Sensitive: prepareSession returns RTMPS / WHIP / WHEP capabilities only on an internal
 * sensitiveCapabilities object for future authorized endpoints — never for logs/public DTOs.
 */

import Features from '../../../config/features.js';
import { LIVE_MARKET_ERROR_CODES, liveMarketError } from '../domain.js';
import { redactCloudflareSecrets, safeCloudflareErrorMessage } from './cloudflareStreamRedact.js';
import { assertCloudflareStreamWebhookSignature } from './cloudflareWebhookVerify.js';

/**
 * @typedef {import('./cloudflareStreamConfig.js').CloudflareStreamConfig} CloudflareStreamConfig
 */

/**
 * @typedef {object} CloudflareSensitiveCapabilities
 * @property {string} [rtmpsUrl] Sensitive RTMPS ingest URL — do not persist/log
 * @property {string} [rtmpsStreamKey] Sensitive RTMPS stream key — do not persist/log
 * @property {string} [whipPublishUrl] Sensitive WHIP publish capability — do not persist/log
 * @property {string} [whepPlaybackUrl] Internal WHEP playback URL — Slice A only; not public
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
 *   meta: Record<string, unknown> | null,
 *   whipPublishUrl: string | null,
 *   whepPlaybackUrl: string | null,
 *   rtmpsUrl: string | null,
 *   rtmpsStreamKey: string | null,
 * }}
 */
export function normalizeCloudflareLiveInput(result) {
  const row = result && typeof result === 'object' ? result : {};
  const uid = String(row.uid || '').trim();
  const webRTC = row.webRTC && typeof row.webRTC === 'object' ? row.webRTC : {};
  const webRTCPlayback =
    row.webRTCPlayback && typeof row.webRTCPlayback === 'object' ? row.webRTCPlayback : {};
  const rtmps = row.rtmps && typeof row.rtmps === 'object' ? row.rtmps : {};
  return {
    uid,
    status: row.status == null ? null : String(row.status),
    enabled: typeof row.enabled === 'boolean' ? row.enabled : null,
    meta: row.meta && typeof row.meta === 'object' ? row.meta : null,
    whipPublishUrl: webRTC.url ? String(webRTC.url) : null,
    whepPlaybackUrl: webRTCPlayback.url ? String(webRTCPlayback.url) : null,
    rtmpsUrl: rtmps.url ? String(rtmps.url) : null,
    rtmpsStreamKey: rtmps.streamKey ? String(rtmps.streamKey) : null,
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
  else if (!statusRaw && normalized.enabled) status = 'connecting';
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

  /** RTMPS pilot may unlock owner prepare/start while LIVE remains provider-evidence only. */
  unlocksOwnerPrepareStart;

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
   *   rtmpsHostEnabled?: boolean,
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
    this.unlocksOwnerPrepareStart = args.rtmpsHostEnabled !== false;
  }

  #secrets() {
    return { apiToken: this.#config.apiToken, webhookSecret: this.#config.webhookSecret };
  }

  #apiBase() {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.#config.accountId)}/stream/live_inputs`;
  }

  /**
   * @param {string} uid
   */
  #publicPlaybackInfoForUid(uid) {
    const liveInputUid = String(uid || '').trim();
    if (!liveInputUid) return null;
    const customerCode = String(this.#config.customerCode || '').trim();
    return {
      provider: 'cloudflare_stream',
      liveInputUid,
      hlsUrl: customerCode
        ? `https://customer-${customerCode}.cloudflarestream.com/${liveInputUid}/manifest/video.m3u8`
        : null,
      iframeSrc: customerCode
        ? `https://customer-${customerCode}.cloudflarestream.com/${liveInputUid}/iframe`
        : null,
    };
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

    const recordingMode =
      Features.liveMarket.recordingV1 && input?.recordingEnabled ? 'automatic' : 'off';
    const body = {
      meta: {
        name: String(input?.title || `cardbey-live-${sessionId}`).slice(0, 120),
        cardbeySessionId: sessionId,
        cardbeyStoreId: storeId,
      },
      recording: {
        mode: recordingMode,
      },
      ...(Array.isArray(this.#config.allowedOrigins) && this.#config.allowedOrigins.length
        ? { allowedOrigins: [...this.#config.allowedOrigins] }
        : {}),
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

    this.#sessionToUid.set(sessionId, normalized.uid);

    /** @type {CloudflareSensitiveCapabilities | undefined} */
    let sensitiveCapabilities;
    if (
      normalized.rtmpsUrl ||
      normalized.rtmpsStreamKey ||
      normalized.whipPublishUrl ||
      normalized.whepPlaybackUrl
    ) {
      sensitiveCapabilities = {};
      if (normalized.rtmpsUrl) sensitiveCapabilities.rtmpsUrl = normalized.rtmpsUrl;
      if (normalized.rtmpsStreamKey) sensitiveCapabilities.rtmpsStreamKey = normalized.rtmpsStreamKey;
      if (normalized.whipPublishUrl) sensitiveCapabilities.whipPublishUrl = normalized.whipPublishUrl;
      if (normalized.whepPlaybackUrl) sensitiveCapabilities.whepPlaybackUrl = normalized.whepPlaybackUrl;
    }

    /** @type {CloudflarePreparedSession} */
    const prepared = {
      sessionId,
      status: 'prepared',
      // Persistable correlation id only — never the WHIP capability
      externalRef: normalized.uid,
      ...(sensitiveCapabilities ? { sensitiveCapabilities } : {}),
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
    // Never promote to live here — owner click may at most reflect CONNECTING.
    if (state.status === 'connecting' || state.status === 'live') {
      return {
        sessionId,
        status: 'connecting',
        externalRef: state.externalRef,
      };
    }
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
   * @param {string} uid
   */
  async enableLiveInput(uid) {
    const liveInputUid = String(uid || '').trim();
    if (!liveInputUid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input uid is required',
        { provider: 'cloudflare_stream' },
      );
    }
    const json = await this.#request(`/${encodeURIComponent(liveInputUid)}`, {
      method: 'PUT',
      body: { enabled: true },
      retryReads: false,
    });
    return normalizeCloudflareLiveInput(json?.result);
  }

  /**
   * @param {string} uid
   */
  async disableLiveInput(uid) {
    const liveInputUid = String(uid || '').trim();
    if (!liveInputUid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input uid is required',
        { provider: 'cloudflare_stream' },
      );
    }
    const json = await this.#request(`/${encodeURIComponent(liveInputUid)}`, {
      method: 'PUT',
      body: { enabled: false },
      retryReads: false,
    });
    return normalizeCloudflareLiveInput(json?.result);
  }

  /**
   * @param {{ sessionId?: string, externalRef?: string, uid?: string }} input
   */
  async getRtmpsCredentials(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      String(input?.uid || input?.externalRef || '').trim() ||
      this.#sessionToUid.get(sessionId) ||
      '';
    if (!uid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input not found for RTMPS credentials',
        { provider: 'cloudflare_stream' },
      );
    }
    const json = await this.#request(`/${encodeURIComponent(uid)}`, {
      method: 'GET',
      retryReads: true,
    });
    const normalized = normalizeCloudflareLiveInput(json?.result);
    if (!normalized.uid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input missing uid',
        { provider: 'cloudflare_stream' },
      );
    }
    this.#sessionToUid.set(sessionId, normalized.uid);
    return {
      sessionId,
      externalRef: normalized.uid,
      rtmpsUrl: normalized.rtmpsUrl || null,
      rtmpsStreamKey: normalized.rtmpsStreamKey || null,
      whipPublishUrl: normalized.whipPublishUrl || null,
      whepPlaybackUrl: normalized.whepPlaybackUrl || null,
    };
  }

  /**
   * @param {{ externalRef?: string, uid?: string }} input
   */
  async getPublicPlaybackInfo(input) {
    const uid = String(input?.uid || input?.externalRef || '').trim();
    if (!uid) return null;
    return this.#publicPlaybackInfoForUid(uid);
  }

  /**
   * @param {string} uid
   */
  async listVideosForInput(uid) {
    const liveInputUid = String(uid || '').trim();
    if (!liveInputUid) return [];
    const json = await this.#request(`/${encodeURIComponent(liveInputUid)}/videos`, {
      method: 'GET',
      retryReads: true,
    });
    const rows = Array.isArray(json?.result?.videos)
      ? json.result.videos
      : Array.isArray(json?.result)
        ? json.result
        : [];
    return rows.map((row) => ({
      uid: String(row?.uid || '').trim() || null,
      status: row?.status == null ? null : String(row.status),
      readyToStream: row?.readyToStream == null ? null : Boolean(row.readyToStream),
      created: row?.created ?? null,
      duration: Number.isFinite(row?.duration) ? Number(row.duration) : null,
      meta: row?.meta && typeof row.meta === 'object' ? row.meta : null,
    }));
  }

  /**
   * @param {{ sessionId?: string, externalRef?: string, uid?: string }} input
   */
  async reconcileLiveInputStatus(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      String(input?.uid || input?.externalRef || '').trim() ||
      this.#sessionToUid.get(sessionId) ||
      '';
    if (!uid) {
      return {
        sessionId,
        status: 'idle',
        externalRef: undefined,
        providerConfirmedLive: false,
        playbackInfo: null,
      };
    }

    const json = await this.#request(`/${encodeURIComponent(uid)}`, {
      method: 'GET',
      retryReads: true,
    });
    const normalized = normalizeCloudflareLiveInput(json?.result);
    const externalRef = normalized.uid || uid;
    this.#sessionToUid.set(sessionId, externalRef);
    const state = mapLiveInputToVideoSessionState({ ...normalized, uid: externalRef }, sessionId);
    return {
      ...state,
      providerStatus: normalized.status,
      providerEnabled: normalized.enabled,
      providerConfirmedLive: state.status === 'live',
      playbackInfo: this.#publicPlaybackInfoForUid(externalRef),
    };
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
 *   rtmpsHostEnabled?: boolean,
 * }} args
 */
export function createCloudflareStreamLiveVideoProvider(args) {
  return new CloudflareStreamLiveVideoProvider(args);
}
