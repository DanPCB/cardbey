/**
 * Cloudflare Stream LiveVideoProvider adapter — RTMPS pilot.
 *
 * Official contracts:
 * - Live inputs API: https://developers.cloudflare.com/api/resources/stream/subresources/live_inputs/
 * - Live notifications: https://developers.cloudflare.com/stream/stream-live/webhooks/
 *
 * Resource strategy: one live input per Cardbey session.
 * providerExternalRef stores only the Cloudflare live-input UID.
 * RTMPS credentials are returned only via sensitiveCapabilities / credentials endpoint — never persisted.
 * WebRTC WHIP/WHEP remains deferred (ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1).
 */

import Features from '../../../config/features.js';
import { LIVE_MARKET_ERROR_CODES, liveMarketError } from '../domain.js';
import { redactCloudflareSecrets, safeCloudflareErrorMessage } from './cloudflareStreamRedact.js';
import { assertCloudflareNotificationsWebhookAuth } from './cloudflareNotificationsAuth.js';

/**
 * @typedef {import('./cloudflareStreamConfig.js').CloudflareStreamConfig} CloudflareStreamConfig
 */

/**
 * @typedef {object} CloudflareRtmpsCapabilities
 * @property {string} rtmpsUrl
 * @property {string} streamKey
 * @property {string} [advisory] Owner-facing advisory (no secrets)
 */

/**
 * @typedef {object} CloudflarePlaybackInfo
 * @property {string} liveInputUid
 * @property {string | null} videoId
 * @property {string | null} playerUrl
 * @property {string | null} hlsUrl
 * @property {boolean} live
 */

/**
 * @typedef {import('../providers.js').PreparedVideoSession & {
 *   sensitiveCapabilities?: CloudflareRtmpsCapabilities,
 *   playback?: CloudflarePlaybackInfo,
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
 *   rtmpsUrl: string | null,
 *   streamKey: string | null,
 * }}
 */
export function normalizeCloudflareLiveInput(result) {
  const row = result && typeof result === 'object' ? result : {};
  const uid = String(row.uid || '').trim();
  const rtmps = row.rtmps && typeof row.rtmps === 'object' ? row.rtmps : {};
  return {
    uid,
    status: row.status == null ? null : String(row.status),
    enabled: typeof row.enabled === 'boolean' ? row.enabled : null,
    rtmpsUrl: rtmps.url ? String(rtmps.url) : null,
    streamKey: rtmps.streamKey ? String(rtmps.streamKey) : null,
  };
}

/**
 * @param {{ status: string | null, enabled: boolean | null, uid: string }} normalized
 * @param {string} sessionId
 */
export function mapLiveInputToVideoSessionState(normalized, sessionId) {
  const statusRaw = String(normalized.status || '').toLowerCase();
  let status = 'prepared';
  if (normalized.enabled === false) status = 'ended';
  else if (statusRaw === 'connected' || statusRaw === 'reconnected') status = 'live';
  else if (
    statusRaw === 'disconnected' ||
    statusRaw === 'client_disconnect' ||
    statusRaw === 'ttl_exceeded' ||
    statusRaw === 'reconnecting'
  ) {
    status = 'prepared';
  } else if (
    statusRaw === 'failed_to_connect' ||
    statusRaw === 'failed_to_reconnect'
  ) {
    status = 'failed';
  } else if (!normalized.uid) status = 'unknown';
  return {
    sessionId: String(sessionId || ''),
    status,
    externalRef: normalized.uid || undefined,
    providerStatus: normalized.status || null,
    connected: status === 'live',
  };
}

/**
 * @param {string} customerCode
 * @param {string} uid
 */
export function buildCloudflarePlayerUrls(customerCode, uid) {
  const code = String(customerCode || '').trim();
  const id = String(uid || '').trim();
  if (!code || !id) {
    return { playerUrl: null, hlsUrl: null };
  }
  const base = `https://customer-${code}.cloudflarestream.com/${id}`;
  return {
    playerUrl: `${base}/iframe`,
    hlsUrl: `${base}/manifest/video.m3u8`,
  };
}

export class CloudflareStreamLiveVideoProvider {
  /** @type {string} */
  name = 'cloudflare_stream';

  /** RTMPS pilot — WebRTC remains deferred. */
  experimental = false;

  /**
   * Unlocks owner prepare/start-intent when RTMPS host flag is on.
   * Never implies user-action LIVE.
   */
  get unlocksOwnerPrepareStart() {
    try {
      return Boolean(Features.liveMarket?.rtmpsHostV1);
    } catch {
      return false;
    }
  }

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
    return {
      apiToken: this.#config.apiToken,
      webhookSecret: this.#config.webhookSecret,
      notificationsWebhookAuth: this.#config.notificationsWebhookAuth,
    };
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
            provider: 'cloudflare_stream',
          });
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
          LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE,
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
    throw (
      lastErr ||
      liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE,
        'Cloudflare Stream request failed',
      )
    );
  }

  /**
   * @param {string} uid
   * @param {string} [videoId]
   * @returns {CloudflarePlaybackInfo}
   */
  #playbackFor(uid, videoId = null) {
    const playUid = String(videoId || uid || '').trim();
    const urls = buildCloudflarePlayerUrls(this.#config.customerCode || '', playUid);
    return {
      liveInputUid: String(uid || ''),
      videoId: videoId ? String(videoId) : null,
      playerUrl: urls.playerUrl,
      hlsUrl: urls.hlsUrl,
      live: true,
    };
  }

  /**
   * Create one Live Input for one Cardbey session (recording off unless recording flag).
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

    const recordingEnabled =
      Boolean(input?.recordingEnabled) && Boolean(Features.liveMarket?.recordingV1);

    /** @type {Record<string, unknown>} */
    const recording = {
      mode: recordingEnabled ? 'automatic' : 'off',
      requireSignedURLs: false,
    };
    if (this.#config.allowedOrigins.length > 0) {
      recording.allowedOrigins = [...this.#config.allowedOrigins];
    }

    const body = {
      meta: {
        name: String(input?.title || `cardbey-live-${sessionId}`).slice(0, 120),
        cardbeySessionId: sessionId,
        cardbeyStoreId: storeId,
      },
      recording,
      // Do not enable WebRTC / simulcast for this pilot.
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
    if (!normalized.rtmpsUrl || !normalized.streamKey) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED,
        'Cloudflare Stream live input missing RTMPS credentials',
        { provider: 'cloudflare_stream' },
      );
    }

    this.#sessionToUid.set(sessionId, normalized.uid);

    return {
      sessionId,
      status: 'prepared',
      externalRef: normalized.uid,
      sensitiveCapabilities: {
        rtmpsUrl: normalized.rtmpsUrl,
        streamKey: normalized.streamKey,
        advisory: 'Treat the stream key as a durable bearer credential. Do not share or store it in the browser.',
      },
      playback: this.#playbackFor(normalized.uid),
    };
  }

  /**
   * Retrieve RTMPS publishing credentials for an existing Live Input (never persist).
   * @param {{ sessionId: string, externalRef?: string }} input
   * @returns {Promise<CloudflareRtmpsCapabilities & { externalRef: string }>}
   */
  async getBroadcastCredentials(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      String(input?.externalRef || '').trim() || this.#sessionToUid.get(sessionId) || '';
    if (!uid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input not found for session',
        { provider: 'cloudflare_stream' },
      );
    }
    const json = await this.#request(`/${encodeURIComponent(uid)}`, {
      method: 'GET',
      retryReads: true,
    });
    const normalized = normalizeCloudflareLiveInput(json?.result);
    if (!normalized.rtmpsUrl || !normalized.streamKey) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE,
        'Cloudflare live input missing RTMPS credentials',
        { provider: 'cloudflare_stream' },
      );
    }
    this.#sessionToUid.set(sessionId, normalized.uid || uid);
    return {
      externalRef: normalized.uid || uid,
      rtmpsUrl: normalized.rtmpsUrl,
      streamKey: normalized.streamKey,
      advisory: 'Configure OBS with this RTMPS URL and stream key. Reveal only when needed.',
    };
  }

  /**
   * @param {{ sessionId: string, externalRef?: string }} input
   */
  async enableLiveInput(input) {
    return this.#setEnabled(input, true);
  }

  /**
   * @param {{ sessionId: string, externalRef?: string }} input
   */
  async disableLiveInput(input) {
    return this.#setEnabled(input, false);
  }

  /**
   * @param {{ sessionId: string, externalRef?: string }} input
   * @param {boolean} enabled
   */
  async #setEnabled(input, enabled) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      String(input?.externalRef || '').trim() || this.#sessionToUid.get(sessionId) || '';
    if (!uid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input not found for session',
        { provider: 'cloudflare_stream' },
      );
    }
    const json = await this.#request(`/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      body: { enabled: Boolean(enabled) },
      retryReads: false,
    });
    const normalized = normalizeCloudflareLiveInput(json?.result);
    return mapLiveInputToVideoSessionState(
      { ...normalized, uid: normalized.uid || uid, enabled: Boolean(enabled) },
      sessionId,
    );
  }

  /**
   * Start-intent is a no-op inspect — never marks LIVE from owner click.
   * @param {import('../providers.js').StartVideoSessionInput} input
   */
  async startSession(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const state = await this.getSessionState({ sessionId, externalRef: input?.externalRef });
    if (state.status === 'unknown' && !state.externalRef) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'Cloudflare live input not found for session',
        { provider: 'cloudflare_stream' },
      );
    }
    // Ensure input accepts connections while host starts OBS.
    if (state.status !== 'live' && state.externalRef) {
      try {
        await this.enableLiveInput({ sessionId, externalRef: state.externalRef });
      } catch {
        // Non-fatal — reconciliation will surface state.
      }
    }
    if (state.status === 'live') return state;
    return {
      sessionId,
      status: 'connecting',
      externalRef: state.externalRef,
      connected: false,
    };
  }

  /**
   * Disable Live Input (prefer over immediate delete so reconnect recovery is possible).
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

    try {
      await this.#request(`/${encodeURIComponent(uid)}`, {
        method: 'PUT',
        body: { enabled: false },
        retryReads: false,
      });
    } catch (err) {
      if (err?.code !== LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND) {
        void redactCloudflareSecrets(err?.message, this.#secrets());
        throw liveMarketError(
          LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE,
          safeCloudflareErrorMessage(err, this.#secrets()),
          { provider: 'cloudflare_stream' },
        );
      }
    }

    return {
      sessionId,
      status: 'ended',
      externalRef: uid,
      connected: false,
    };
  }

  /**
   * @param {{ sessionId: string, externalRef?: string }} input
   */
  async deleteLiveInput(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      String(input?.externalRef || '').trim() || this.#sessionToUid.get(sessionId) || '';
    if (!uid) return { sessionId, status: 'ended' };
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
    return { sessionId, status: 'ended', externalRef: uid };
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
   * Public-safe playback information (no RTMPS / keys).
   * @param {{ sessionId: string, externalRef?: string, videoId?: string | null }} input
   */
  async getPlaybackInfo(input) {
    const state = await this.getSessionState(input);
    const uid = state.externalRef || String(input?.externalRef || '').trim();
    if (!uid) {
      return {
        liveInputUid: '',
        videoId: null,
        playerUrl: null,
        hlsUrl: null,
        live: false,
      };
    }
    const playback = this.#playbackFor(uid, input?.videoId || null);
    return {
      ...playback,
      live: state.status === 'live',
    };
  }

  /**
   * List videos created by the Live Input.
   * @param {{ sessionId: string, externalRef?: string }} input
   */
  async listLiveInputVideos(input) {
    const sessionId = String(input?.sessionId || '').trim();
    const uid =
      String(input?.externalRef || '').trim() || this.#sessionToUid.get(sessionId) || '';
    if (!uid) return [];
    const json = await this.#request(`/${encodeURIComponent(uid)}/videos`, {
      method: 'GET',
      retryReads: true,
    });
    const rows = Array.isArray(json?.result) ? json.result : [];
    return rows.map((row) => ({
      uid: String(row?.uid || '').trim(),
      status: row?.status?.state ? String(row.status.state) : null,
      readyToStream: Boolean(row?.readyToStream),
      liveInput: String(row?.liveInput || uid),
    })).filter((v) => v.uid);
  }

  /**
   * Prefer currently live / in-progress video for the input.
   * @param {{ sessionId: string, externalRef?: string }} input
   */
  async discoverActiveVideo(input) {
    const videos = await this.listLiveInputVideos(input);
    const liveish = videos.find((v) =>
      ['live-inprogress', 'live', 'inprogress'].includes(String(v.status || '').toLowerCase()),
    );
    return liveish || videos[0] || null;
  }

  /**
   * Prefer ready completed recording (recording flag path; unused while recording off).
   * @param {{ sessionId: string, externalRef?: string }} input
   */
  async discoverCompletedRecording(input) {
    const videos = await this.listLiveInputVideos(input);
    return (
      videos.find((v) => v.readyToStream && String(v.status || '').toLowerCase() === 'ready') ||
      null
    );
  }

  /**
   * @param {{ videoUid: string }} input
   */
  async deleteRecording(input) {
    const videoUid = String(input?.videoUid || '').trim();
    if (!videoUid) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'videoUid required',
      );
    }
    // Videos API is under /stream/{videoUid}, not live_inputs.
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.#config.accountId)}/stream/${encodeURIComponent(videoUid)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const res = await this.#fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.#config.apiToken}` },
        signal: controller.signal,
      });
      if (!res.ok && res.status !== 404) {
        throw liveMarketError(
          mapHttpStatusToCode(res.status),
          safeCloudflareErrorMessage(`Cloudflare Stream HTTP ${res.status}`, this.#secrets()),
          { provider: 'cloudflare_stream', httpStatus: res.status },
        );
      }
      return { ok: true, videoUid };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Live Input Notifications via Cloudflare Notifications destinations.
   * Authenticity: `cf-webhook-auth` header (NOT Stream video-library HMAC).
   * @param {import('../providers.js').VerifyWebhookInput} input
   */
  async verifyWebhook(input) {
    const secret = this.#config.notificationsWebhookAuth;
    if (!secret) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
        'Cloudflare Notifications webhook auth is not configured',
        { provider: 'cloudflare_stream' },
      );
    }
    const headers = input?.headers && typeof input.headers === 'object' ? input.headers : {};
    assertCloudflareNotificationsWebhookAuth({
      headers,
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
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const uid = String(data.input_id || payload.input_id || '').trim();
    const eventType = String(data.event_type || payload.event_type || '').trim();
    const updatedAt = String(data.updated_at || payload.ts || '').trim();
    const errorCode =
      data.live_input_errored?.error?.code != null
        ? String(data.live_input_errored.error.code)
        : undefined;

    const sessionId =
      [...this.#sessionToUid.entries()].find(([, v]) => v === uid)?.[0] || '';

    const eventId = [
      'cf-live',
      uid || 'unknown',
      eventType || 'unknown',
      updatedAt || String(payload.ts || ''),
    ].join(':');

    return {
      eventId,
      sessionId,
      type: eventType || 'stream.live_input',
      payload: {
        uid: uid || undefined,
        eventType: eventType || undefined,
        errorCode,
        // Never include raw text / nested provider dumps
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
