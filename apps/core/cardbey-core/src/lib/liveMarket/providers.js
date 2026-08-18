/**
 * Provider-neutral Live Market video ports (RTMPS pilot).
 * Missing / gated provider → LIVE_PROVIDER_NOT_CONFIGURED.
 * Fake adapter is never selected implicitly for Cloudflare flags.
 */

import Features from '../../config/features.js';
import { LIVE_MARKET_ERROR_CODES, liveMarketError } from './domain.js';
import {
  isCloudflareStreamProviderSelected,
  readCloudflareStreamConfig,
} from './providers/cloudflareStreamConfig.js';
import { createCloudflareStreamLiveVideoProvider } from './providers/cloudflareStreamProvider.js';

/**
 * @typedef {object} PrepareVideoSessionInput
 * @property {string} sessionId
 * @property {string} storeId
 * @property {string} hostUserId
 * @property {string} [title]
 * @property {boolean} [recordingEnabled]
 */

/**
 * @typedef {object} PreparedVideoSession
 * @property {string} sessionId
 * @property {'prepared'} status
 * @property {string} [externalRef] Provider-side id — never Cardbey authoritative identity
 */

/**
 * @typedef {object} StartVideoSessionInput
 * @property {string} sessionId
 * @property {string} storeId
 * @property {string} [externalRef]
 */

/**
 * @typedef {object} EndVideoSessionInput
 * @property {string} sessionId
 * @property {string} storeId
 * @property {string} [reasonCode]
 * @property {string} [externalRef]
 */

/**
 * @typedef {object} GetVideoSessionStateInput
 * @property {string} sessionId
 * @property {string} [externalRef]
 */

/**
 * @typedef {object} VideoSessionState
 * @property {string} sessionId
 * @property {'idle'|'prepared'|'connecting'|'live'|'ended'|'failed'|'unknown'} status
 * @property {string} [externalRef]
 * @property {boolean} [connected]
 * @property {string | null} [providerStatus]
 */

/**
 * @typedef {object} VerifyWebhookInput
 * @property {unknown} headers
 * @property {unknown} body
 * @property {string} [rawBody]
 */

/**
 * @typedef {object} VerifiedVideoEvent
 * @property {string} eventId Idempotency key for webhook handling
 * @property {string} sessionId
 * @property {string} type
 * @property {object} [payload]
 */

/**
 * @typedef {object} LiveVideoProvider
 * @property {string} [name]
 * @property {boolean} [unlocksOwnerPrepareStart]
 * @property {(input: PrepareVideoSessionInput) => Promise<PreparedVideoSession>} prepareSession
 * @property {(input: StartVideoSessionInput) => Promise<VideoSessionState>} startSession
 * @property {(input: EndVideoSessionInput) => Promise<VideoSessionState>} endSession
 * @property {(input: GetVideoSessionStateInput) => Promise<VideoSessionState>} getSessionState
 * @property {(input: VerifyWebhookInput) => Promise<VerifiedVideoEvent>} verifyWebhook
 * @property {(input: object) => Promise<object>} [getBroadcastCredentials]
 * @property {(input: object) => Promise<object>} [getPlaybackInfo]
 * @property {(input: object) => Promise<object>} [enableLiveInput]
 * @property {(input: object) => Promise<object>} [disableLiveInput]
 */

export class NotConfiguredLiveVideoProvider {
  /** @type {string} */
  name = 'not_configured';

  unlocksOwnerPrepareStart = false;

  async prepareSession() {
    throw liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'Live video provider is not configured',
    );
  }

  async startSession() {
    throw liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'Live video provider is not configured',
    );
  }

  async endSession() {
    throw liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'Live video provider is not configured',
    );
  }

  async getSessionState(input) {
    return {
      sessionId: String(input?.sessionId || ''),
      status: 'unknown',
    };
  }

  async verifyWebhook() {
    throw liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'Live video provider is not configured',
    );
  }

  async getBroadcastCredentials() {
    throw liveMarketError(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'Live video provider is not configured',
    );
  }
}

/**
 * Explicit fake adapter for automated tests / local simulation only.
 * Never select this when NODE_ENV=production.
 * Never selected by Cloudflare flags.
 * startSession returns connecting — never live from user action.
 */
export class FakeLiveVideoProvider {
  /** @type {string} */
  name = 'fake_live_video';

  unlocksOwnerPrepareStart = true;

  /** @type {Map<string, VideoSessionState>} */
  #states = new Map();

  /** @type {boolean} */
  #forceConnected = false;

  /** Test helper: simulate provider connection evidence. */
  simulateConnected(sessionId, connected = true) {
    const id = String(sessionId);
    const prev = this.#states.get(id) || { sessionId: id, status: 'prepared' };
    const state = {
      ...prev,
      sessionId: id,
      status: connected ? 'live' : 'prepared',
      connected: Boolean(connected),
      externalRef: prev.externalRef || `fake:${id}`,
    };
    this.#states.set(id, state);
    this.#forceConnected = connected;
    return state;
  }

  async prepareSession(input) {
    const sessionId = String(input.sessionId);
    const state = {
      sessionId,
      status: 'prepared',
      externalRef: `fake:${sessionId}`,
      connected: false,
    };
    this.#states.set(sessionId, state);
    return {
      sessionId,
      status: 'prepared',
      externalRef: state.externalRef,
      sensitiveCapabilities: {
        rtmpsUrl: 'rtmps://fake.example/live/',
        streamKey: `fake-key-${sessionId}`,
        advisory: 'test-only',
      },
    };
  }

  async startSession(input) {
    const sessionId = String(input.sessionId);
    const prev = this.#states.get(sessionId);
    const state = {
      sessionId,
      status: 'connecting',
      externalRef: prev?.externalRef ?? `fake:${sessionId}`,
      connected: false,
    };
    this.#states.set(sessionId, state);
    return state;
  }

  async endSession(input) {
    const sessionId = String(input.sessionId);
    const state = {
      sessionId,
      status: 'ended',
      externalRef: this.#states.get(sessionId)?.externalRef ?? `fake:${sessionId}`,
      connected: false,
    };
    this.#states.set(sessionId, state);
    return state;
  }

  async getSessionState(input) {
    const sessionId = String(input.sessionId);
    return (
      this.#states.get(sessionId) || {
        sessionId,
        status: 'idle',
      }
    );
  }

  async getBroadcastCredentials(input) {
    const sessionId = String(input.sessionId);
    const prev = this.#states.get(sessionId);
    if (!prev?.externalRef) {
      throw liveMarketError(
        LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
        'fake live input not prepared',
      );
    }
    return {
      externalRef: prev.externalRef,
      rtmpsUrl: 'rtmps://fake.example/live/',
      streamKey: `fake-key-${sessionId}`,
      advisory: 'test-only',
    };
  }

  async getPlaybackInfo(input) {
    const state = await this.getSessionState(input);
    return {
      liveInputUid: state.externalRef || '',
      videoId: null,
      playerUrl: state.status === 'live' ? 'https://example.test/player' : null,
      hlsUrl: state.status === 'live' ? 'https://example.test/hls.m3u8' : null,
      live: state.status === 'live',
    };
  }

  async verifyWebhook(input) {
    const body = input?.body && typeof input.body === 'object' ? input.body : {};
    const eventId = String(body.eventId || body.id || `fake-evt-${Date.now()}`);
    return {
      eventId,
      sessionId: String(body.sessionId || ''),
      type: String(body.type || 'unknown'),
      payload: { uid: body.uid },
    };
  }
}

/**
 * Owner prepare/start-intent capabilities require a configured provider that unlocks them.
 * Cloudflare unlocks only when RTMPS host flag is on (never WebRTC-only Slice A).
 * @param {LiveVideoProvider | null | undefined} provider
 */
export function isOwnerCapabilityProviderReady(provider) {
  if (!provider || provider.name === 'not_configured') return false;
  if (provider.unlocksOwnerPrepareStart === false) return false;
  if (provider.name === 'cloudflare_stream') {
    return provider.unlocksOwnerPrepareStart === true;
  }
  return provider.name === 'fake_live_video' || provider.unlocksOwnerPrepareStart === true;
}

/**
 * Resolve the active video provider.
 * Production never gets FakeLiveVideoProvider unless LIVE_MARKET_ALLOW_FAKE_PROVIDER
 * (still blocked when NODE_ENV=production). Cloudflare never implies fake.
 *
 * @param {{ provider?: LiveVideoProvider | null, env?: NodeJS.ProcessEnv }} [options]
 * @returns {LiveVideoProvider}
 */
export function resolveLiveVideoProvider(options = {}) {
  if (options.provider) return options.provider;

  const env = options.env || process.env;

  const allowFake =
    String(env.NODE_ENV || process.env.NODE_ENV) !== 'production' &&
    String(env.LIVE_MARKET_ALLOW_FAKE_PROVIDER || '').toLowerCase() === 'true';

  const liveMarketV1 =
    options.env != null
      ? String(env.ENABLE_LIVE_MARKET_V1 || '').toLowerCase() === 'true'
      : Features.liveMarket.v1;
  const broadcastV1 =
    liveMarketV1 &&
    (options.env != null
      ? String(env.ENABLE_LIVE_BROADCAST_V1 || '').toLowerCase() === 'true'
      : Features.liveMarket.broadcastV1);
  const cloudflareStreamV1 =
    liveMarketV1 &&
    (options.env != null
      ? String(env.ENABLE_LIVE_CLOUDFLARE_STREAM_V1 || '').toLowerCase() === 'true'
      : Features.liveMarket.cloudflareStreamV1);

  const selected = isCloudflareStreamProviderSelected(env, {
    liveMarketV1,
    broadcastV1,
    cloudflareStreamV1,
  });

  if (selected) {
    const cfg = readCloudflareStreamConfig(env);
    if (!cfg.ok) {
      return new NotConfiguredLiveVideoProvider();
    }
    try {
      return createCloudflareStreamLiveVideoProvider({ config: cfg.config });
    } catch {
      return new NotConfiguredLiveVideoProvider();
    }
  }

  if (allowFake) {
    return new FakeLiveVideoProvider();
  }

  return new NotConfiguredLiveVideoProvider();
}

/** Reserved for Phase 4 — define only as a typed seam; no implementation. */
export const LiveSpeechProvider = null;

/** Prefer Language Intelligence later — reserved seam only. */
export const LiveTranslationProvider = null;
