/**
 * Provider-neutral Live Market video ports (Phase 1 + Cloudflare Stream Slice A).
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
 */

/**
 * @typedef {object} VerifyWebhookInput
 * @property {unknown} headers
 * @property {unknown} body
 * @property {string} [rawBody]
 */

/**
 * @typedef {object} VerifiedVideoEvent
 * @property {string} eventId Idempotency key for future webhook handling
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
}

/**
 * Explicit fake adapter for automated tests / local simulation only.
 * Never select this when NODE_ENV=production.
 * Never selected by Cloudflare flags.
 */
export class FakeLiveVideoProvider {
  /** @type {string} */
  name = 'fake_live_video';

  unlocksOwnerPrepareStart = true;

  /** @type {Map<string, VideoSessionState>} */
  #states = new Map();

  async prepareSession(input) {
    const sessionId = String(input.sessionId);
    const state = {
      sessionId,
      status: 'prepared',
      externalRef: `fake:${sessionId}`,
    };
    this.#states.set(sessionId, state);
    return {
      sessionId,
      status: 'prepared',
      externalRef: state.externalRef,
    };
  }

  async startSession(input) {
    const sessionId = String(input.sessionId);
    const state = {
      sessionId,
      status: 'prepared',
      externalRef: this.#states.get(sessionId)?.externalRef ?? `fake:${sessionId}`,
    };
    this.#states.set(sessionId, state);
    return state;
  }

  /**
   * Test-only helper to simulate provider-confirmed connection.
   * @param {string} sessionId
   */
  confirmConnected(sessionId) {
    const id = String(sessionId);
    const state = {
      sessionId: id,
      status: 'live',
      externalRef: this.#states.get(id)?.externalRef ?? `fake:${id}`,
    };
    this.#states.set(id, state);
    return state;
  }

  async endSession(input) {
    const sessionId = String(input.sessionId);
    const state = {
      sessionId,
      status: 'ended',
      externalRef: this.#states.get(sessionId)?.externalRef ?? `fake:${sessionId}`,
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

  async verifyWebhook(input) {
    const body = input?.body && typeof input.body === 'object' ? input.body : {};
    const eventId = String(body.eventId || body.id || `fake-evt-${Date.now()}`);
    return {
      eventId,
      sessionId: String(body.sessionId || ''),
      type: String(body.type || 'unknown'),
      payload: body,
    };
  }
}

/**
 * Owner prepare/start readiness remains provider-specific.
 * Cloudflare RTMPS may unlock prepare/start, but never authorizes LIVE without provider evidence.
 * @param {LiveVideoProvider | null | undefined} provider
 */
export function isOwnerCapabilityProviderReady(provider) {
  if (!provider || provider.name === 'not_configured') return false;
  if (provider.unlocksOwnerPrepareStart === false) return false;
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

  // Prefer explicit env snapshot (tests) over Features getters when env override is passed.
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
  const rtmpsHostV1 =
    broadcastV1 &&
    cloudflareStreamV1 &&
    (options.env != null
      ? String(env.ENABLE_LIVE_RTMPS_HOST_V1 || '').toLowerCase() === 'true'
      : Features.liveMarket.rtmpsHostV1);

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
      return createCloudflareStreamLiveVideoProvider({
        config: cfg.config,
        rtmpsHostEnabled: rtmpsHostV1,
      });
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
