import { afterEach, describe, expect, it, vi } from 'vitest';
import Features, { snapshotFeatures } from '../../../config/features.js';
import { LIVE_MARKET_ERROR_CODES } from '../domain.js';
import {
  FakeLiveVideoProvider,
  NotConfiguredLiveVideoProvider,
  isOwnerCapabilityProviderReady,
  resolveLiveVideoProvider,
} from '../providers.js';
import {
  isCloudflareStreamProviderSelected,
  readCloudflareStreamConfig,
} from './cloudflareStreamConfig.js';
import {
  CloudflareStreamLiveVideoProvider,
  createCloudflareStreamLiveVideoProvider,
  normalizeCloudflareLiveInput,
  buildCloudflarePlayerUrls,
} from './cloudflareStreamProvider.js';
import {
  redactCloudflareCapabilityUrl,
  redactCloudflareSecrets,
} from './cloudflareStreamRedact.js';
import {
  verifyCloudflareNotificationsWebhookAuth,
  normalizeCloudflareLiveInputNotification,
} from './cloudflareNotificationsAuth.js';

const RTMPS_URL = 'rtmps://live.cloudflare.com:443/live/';
const STREAM_KEY = 'rtmps_stream_key_DO_NOT_LEAK_abcdef1234567890';
const TOKEN = 'cf_test_token_DO_NOT_LEAK_1234567890';
const NOTIF_AUTH = 'cf_notif_auth_DO_NOT_LEAK_xyz';

function rtmpsFlagsEnv(extra = {}) {
  return {
    NODE_ENV: 'test',
    ENABLE_LIVE_MARKET_V1: 'true',
    ENABLE_LIVE_BROADCAST_V1: 'true',
    ENABLE_LIVE_CLOUDFLARE_STREAM_V1: 'true',
    ENABLE_LIVE_RTMPS_HOST_V1: 'true',
    ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1: 'false',
    LIVE_VIDEO_PROVIDER: 'cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'acct_test_123',
    CLOUDFLARE_STREAM_API_TOKEN: TOKEN,
    CLOUDFLARE_STREAM_CUSTOMER_CODE: 'custcode123',
    CLOUDFLARE_STREAM_ALLOWED_ORIGINS: 'cardbey.com,localhost:5174',
    CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH: NOTIF_AUTH,
    ...extra,
  };
}

function liveInputResult(overrides = {}) {
  return {
    result: {
      uid: '66be4bf738797e01e1fca35a7bdecdcd',
      enabled: true,
      status: null,
      rtmps: { url: RTMPS_URL, streamKey: STREAM_KEY },
      recording: { mode: 'off', allowedOrigins: ['cardbey.com'] },
      meta: { cardbeySessionId: 'sess_1', cardbeyStoreId: 'store_1' },
      ...overrides,
    },
    success: true,
  };
}

describe('Live Market Cloudflare RTMPS flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults broadcast/cloudflare/rtmps flags off', () => {
    vi.stubEnv('ENABLE_LIVE_MARKET_V1', '');
    vi.stubEnv('ENABLE_LIVE_BROADCAST_V1', '');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_STREAM_V1', '');
    vi.stubEnv('ENABLE_LIVE_RTMPS_HOST_V1', '');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1', '');
    expect(Features.liveMarket.broadcastV1).toBe(false);
    expect(Features.liveMarket.cloudflareStreamV1).toBe(false);
    expect(Features.liveMarket.rtmpsHostV1).toBe(false);
    expect(Features.liveMarket.cloudflareWebRtcV1).toBe(false);
    const snap = snapshotFeatures().liveMarket;
    expect(snap.rtmpsHostV1).toBe(false);
    expect(JSON.stringify(snap)).not.toMatch(/apiToken|webhookSecret|Bearer\s|streamKey/i);
  });

  it('selects Cloudflare without WebRTC when RTMPS flags are set', () => {
    expect(
      isCloudflareStreamProviderSelected(rtmpsFlagsEnv(), {
        liveMarketV1: true,
        broadcastV1: true,
        cloudflareStreamV1: true,
      }),
    ).toBe(true);
  });
});

describe('resolveLiveVideoProvider Cloudflare RTMPS selection', () => {
  it('returns NotConfigured by default', () => {
    const p = resolveLiveVideoProvider({ env: { NODE_ENV: 'test' } });
    expect(p).toBeInstanceOf(NotConfiguredLiveVideoProvider);
    expect(isOwnerCapabilityProviderReady(p)).toBe(false);
  });

  it('selects Cloudflare with RTMPS config and unlocks prepare when host flag on', () => {
    vi.stubEnv('ENABLE_LIVE_MARKET_V1', 'true');
    vi.stubEnv('ENABLE_LIVE_BROADCAST_V1', 'true');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_STREAM_V1', 'true');
    vi.stubEnv('ENABLE_LIVE_RTMPS_HOST_V1', 'true');
    const p = resolveLiveVideoProvider({ env: rtmpsFlagsEnv() });
    expect(p).toBeInstanceOf(CloudflareStreamLiveVideoProvider);
    expect(isOwnerCapabilityProviderReady(p)).toBe(true);
  });

  it('does not select Cloudflare when WebRTC-only legacy path without broadcast/stream', () => {
    const p = resolveLiveVideoProvider({
      env: {
        ...rtmpsFlagsEnv({
          ENABLE_LIVE_BROADCAST_V1: 'false',
          ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1: 'true',
        }),
      },
    });
    expect(p).toBeInstanceOf(NotConfiguredLiveVideoProvider);
  });
});

describe('CloudflareStreamLiveVideoProvider RTMPS', () => {
  it('normalizes RTMPS credentials and never requires WHIP', () => {
    const n = normalizeCloudflareLiveInput(liveInputResult().result);
    expect(n.uid).toBe('66be4bf738797e01e1fca35a7bdecdcd');
    expect(n.rtmpsUrl).toBe(RTMPS_URL);
    expect(n.streamKey).toBe(STREAM_KEY);
  });

  it('prepareSession creates Live Input and returns RTMPS sensitive capabilities', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(liveInputResult()),
    }));
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(rtmpsFlagsEnv()).config,
      fetchImpl,
    });
    const prepared = await provider.prepareSession({
      sessionId: 'sess_1',
      storeId: 'store_1',
      hostUserId: 'u1',
      title: 'Test',
    });
    expect(prepared.externalRef).toBe('66be4bf738797e01e1fca35a7bdecdcd');
    expect(prepared.sensitiveCapabilities.rtmpsUrl).toBe(RTMPS_URL);
    expect(prepared.sensitiveCapabilities.streamKey).toBe(STREAM_KEY);
    expect(JSON.stringify(prepared.externalRef)).not.toContain('stream');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.recording.mode).toBe('off');
    expect(body.recording.allowedOrigins).toEqual(['cardbey.com', 'localhost:5174']);
  });

  it('startSession returns connecting and never live from click', async () => {
    const fetchImpl = vi.fn(async (url, opts) => {
      if (String(opts?.method || 'GET').toUpperCase() === 'POST') {
        return { ok: true, status: 200, text: async () => JSON.stringify(liveInputResult()) };
      }
      if (String(opts?.method || 'GET').toUpperCase() === 'PUT') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(liveInputResult({ enabled: true, status: null })),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(liveInputResult({ status: null })),
      };
    });
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(rtmpsFlagsEnv()).config,
      fetchImpl,
    });
    await provider.prepareSession({ sessionId: 'sess_1', storeId: 's', hostUserId: 'u' });
    const started = await provider.startSession({ sessionId: 'sess_1', storeId: 's' });
    expect(started.status).toBe('connecting');
    expect(started.connected).toBe(false);
  });

  it('getSessionState maps connected → live', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(liveInputResult({ status: 'connected' })),
    }));
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(rtmpsFlagsEnv()).config,
      fetchImpl,
    });
    const state = await provider.getSessionState({
      sessionId: 'sess_1',
      externalRef: '66be4bf738797e01e1fca35a7bdecdcd',
    });
    expect(state.status).toBe('live');
    expect(state.connected).toBe(true);
  });

  it('builds player URLs without leaking account id', () => {
    const urls = buildCloudflarePlayerUrls('custcode123', '66be4bf738797e01e1fca35a7bdecdcd');
    expect(urls.playerUrl).toContain('customer-custcode123.cloudflarestream.com');
    expect(urls.hlsUrl).toMatch(/manifest\/video\.m3u8$/);
    expect(JSON.stringify(urls)).not.toMatch(/acct_test|API_TOKEN|stream_key/i);
  });

  it('redacts RTMPS secrets from errors', () => {
    const msg = safeMsg();
    expect(msg).not.toContain(TOKEN);
    expect(msg).not.toContain(STREAM_KEY);
    function safeMsg() {
      return String(
        redactCloudflareSecrets(`fail ${TOKEN} key=${STREAM_KEY} ${RTMPS_URL}`, {
          apiToken: TOKEN,
          streamKey: STREAM_KEY,
        }),
      );
    }
  });

  it('lists videos and discovers active video', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/videos')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              result: [
                { uid: 'vid_ready', status: { state: 'ready' }, readyToStream: true },
                { uid: 'vid_live', status: { state: 'live-inprogress' }, readyToStream: true },
              ],
            }),
        };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(liveInputResult()) };
    });
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(rtmpsFlagsEnv()).config,
      fetchImpl,
    });
    const active = await provider.discoverActiveVideo({
      sessionId: 's',
      externalRef: '66be4bf738797e01e1fca35a7bdecdcd',
    });
    expect(active.uid).toBe('vid_live');
    const done = await provider.discoverCompletedRecording({
      sessionId: 's',
      externalRef: '66be4bf738797e01e1fca35a7bdecdcd',
    });
    expect(done.uid).toBe('vid_ready');
  });

  it('verifyWebhook uses cf-webhook-auth and Live Input payload shape', async () => {
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(rtmpsFlagsEnv()).config,
      fetchImpl: vi.fn(),
    });
    const event = await provider.verifyWebhook({
      headers: { 'cf-webhook-auth': NOTIF_AUTH },
      body: {
        data: {
          input_id: '66be4bf738797e01e1fca35a7bdecdcd',
          event_type: 'live_input.connected',
          updated_at: '2026-08-14T00:00:00Z',
        },
        ts: 1,
      },
    });
    expect(event.type).toBe('live_input.connected');
    expect(event.payload.uid).toBe('66be4bf738797e01e1fca35a7bdecdcd');
    await expect(
      provider.verifyWebhook({
        headers: { 'cf-webhook-auth': 'wrong' },
        body: { data: { input_id: 'x', event_type: 'live_input.connected' } },
      }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_EVENT_INVALID });
  });
});

describe('Cloudflare Notifications auth', () => {
  it('accepts matching cf-webhook-auth', () => {
    expect(
      verifyCloudflareNotificationsWebhookAuth({
        headers: { 'cf-webhook-auth': NOTIF_AUTH },
        secret: NOTIF_AUTH,
      }).ok,
    ).toBe(true);
  });

  it('rejects missing or bad auth', () => {
    expect(
      verifyCloudflareNotificationsWebhookAuth({ headers: {}, secret: NOTIF_AUTH }).ok,
    ).toBe(false);
    expect(
      verifyCloudflareNotificationsWebhookAuth({
        headers: { 'cf-webhook-auth': 'nope' },
        secret: NOTIF_AUTH,
      }).ok,
    ).toBe(false);
  });

  it('normalizes connected/disconnected/errored payloads without raw text', () => {
    const n = normalizeCloudflareLiveInputNotification({
      text: 'do-not-keep',
      data: {
        input_id: 'abc',
        event_type: 'live_input.errored',
        updated_at: 't',
        live_input_errored: { error: { code: 'ERR_GOP_OUT_OF_RANGE', message: 'secretish' } },
      },
      ts: 1,
    });
    expect(n.mapped).toBe('errored');
    expect(n.errorCode).toBe('ERR_GOP_OUT_OF_RANGE');
    expect(JSON.stringify(n)).not.toMatch(/secretish|do-not-keep/);
  });
});

describe('FakeLiveVideoProvider start-intent', () => {
  it('startSession yields connecting not live', async () => {
    const fake = new FakeLiveVideoProvider();
    await fake.prepareSession({ sessionId: 's1', storeId: 'st', hostUserId: 'u' });
    const started = await fake.startSession({ sessionId: 's1', storeId: 'st' });
    expect(started.status).toBe('connecting');
    const connected = fake.simulateConnected('s1', true);
    expect(connected.status).toBe('live');
  });
});

describe('redaction helpers', () => {
  it('redacts rtmps urls', () => {
    expect(redactCloudflareCapabilityUrl(RTMPS_URL)).toBe('[REDACTED_RTMPS_URL]');
  });
});
