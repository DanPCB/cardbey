import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
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
} from './cloudflareStreamProvider.js';
import {
  redactCloudflareCapabilityUrl,
  redactCloudflareSecrets,
} from './cloudflareStreamRedact.js';
import {
  parseCloudflareWebhookSignatureHeader,
  verifyCloudflareStreamWebhookSignature,
} from './cloudflareWebhookVerify.js';

const WHIP =
  'https://customer-example.cloudflarestream.com/pubsecretvalue1234567890abcdef/webRTC/publish';
const WHEP =
  'https://customer-example.cloudflarestream.com/66be4bf738797e01e1fca35a7bdecdcd/webRTC/play';
const TOKEN = 'cf_test_token_DO_NOT_LEAK_1234567890';
const WEBHOOK_SECRET = 'whsec_test_DO_NOT_LEAK_abcdef';

function allFlagsEnv(extra = {}) {
  return {
    NODE_ENV: 'test',
    ENABLE_LIVE_MARKET_V1: 'true',
    ENABLE_LIVE_BROADCAST_V1: 'true',
    ENABLE_LIVE_CLOUDFLARE_STREAM_V1: 'true',
    ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1: 'true',
    LIVE_VIDEO_PROVIDER: 'cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'acct_test_123',
    CLOUDFLARE_STREAM_API_TOKEN: TOKEN,
    CLOUDFLARE_STREAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...extra,
  };
}

function liveInputResult(overrides = {}) {
  return {
    result: {
      uid: '66be4bf738797e01e1fca35a7bdecdcd',
      enabled: true,
      status: null,
      webRTC: { url: WHIP },
      webRTCPlayback: { url: WHEP },
      recording: { mode: 'off' },
      meta: { cardbeySessionId: 'sess_1' },
      ...overrides,
    },
    success: true,
  };
}

describe('Live Market Cloudflare flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults broadcast/cloudflare flags off', () => {
    vi.stubEnv('ENABLE_LIVE_MARKET_V1', '');
    vi.stubEnv('ENABLE_LIVE_BROADCAST_V1', '');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_STREAM_V1', '');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1', '');
    expect(Features.liveMarket.broadcastV1).toBe(false);
    expect(Features.liveMarket.cloudflareStreamV1).toBe(false);
    expect(Features.liveMarket.cloudflareWebRtcV1).toBe(false);
    const snap = snapshotFeatures().liveMarket;
    expect(snap.broadcastV1).toBe(false);
    expect(snap.cloudflareStreamV1).toBe(false);
    expect(snap.cloudflareWebRtcV1).toBe(false);
    expect(JSON.stringify(snap)).not.toMatch(/token|secret|whip|Bearer/i);
  });

  it('subflags cannot bypass master', () => {
    vi.stubEnv('ENABLE_LIVE_MARKET_V1', 'false');
    vi.stubEnv('ENABLE_LIVE_BROADCAST_V1', 'true');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_STREAM_V1', 'true');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1', 'true');
    expect(Features.liveMarket.broadcastV1).toBe(false);
    expect(Features.liveMarket.cloudflareStreamV1).toBe(false);
    expect(Features.liveMarket.cloudflareWebRtcV1).toBe(false);
  });

  it('WebRTC requires broadcast and Cloudflare Stream flags', () => {
    vi.stubEnv('ENABLE_LIVE_MARKET_V1', 'true');
    vi.stubEnv('ENABLE_LIVE_BROADCAST_V1', 'true');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_STREAM_V1', 'false');
    vi.stubEnv('ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1', 'true');
    expect(Features.liveMarket.cloudflareWebRtcV1).toBe(false);
  });
});

describe('resolveLiveVideoProvider Cloudflare selection', () => {
  it('returns NotConfigured by default', () => {
    const p = resolveLiveVideoProvider({
      env: { NODE_ENV: 'test' },
    });
    expect(p).toBeInstanceOf(NotConfiguredLiveVideoProvider);
    expect(isOwnerCapabilityProviderReady(p)).toBe(false);
  });

  it('selects Cloudflare only with all required flags and configuration', () => {
    const p = resolveLiveVideoProvider({ env: allFlagsEnv() });
    expect(p).toBeInstanceOf(CloudflareStreamLiveVideoProvider);
    expect(p.name).toBe('cloudflare_stream');
    expect(isOwnerCapabilityProviderReady(p)).toBe(false);
  });

  it('missing account/token yields NotConfigured (LIVE_PROVIDER_NOT_CONFIGURED on use)', async () => {
    const p = resolveLiveVideoProvider({
      env: allFlagsEnv({ CLOUDFLARE_STREAM_API_TOKEN: '' }),
    });
    expect(p).toBeInstanceOf(NotConfiguredLiveVideoProvider);
    await expect(p.prepareSession({ sessionId: 's', storeId: 'st', hostUserId: 'u' })).rejects.toMatchObject({
      code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
    });
  });

  it('never selects fake implicitly when Cloudflare flags are incomplete', () => {
    const p = resolveLiveVideoProvider({
      env: allFlagsEnv({
        ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1: 'false',
        LIVE_MARKET_ALLOW_FAKE_PROVIDER: 'true',
      }),
    });
    // Incomplete Cloudflare selection falls through; fake only if explicitly allowed
    expect(p).toBeInstanceOf(FakeLiveVideoProvider);
    const incompleteNoFake = resolveLiveVideoProvider({
      env: allFlagsEnv({
        ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1: 'false',
        LIVE_MARKET_ALLOW_FAKE_PROVIDER: 'false',
      }),
    });
    expect(incompleteNoFake).toBeInstanceOf(NotConfiguredLiveVideoProvider);
  });

  it('Cloudflare selection does not use fake even if fake flag is set', () => {
    const p = resolveLiveVideoProvider({
      env: allFlagsEnv({ LIVE_MARKET_ALLOW_FAKE_PROVIDER: 'true' }),
    });
    expect(p).toBeInstanceOf(CloudflareStreamLiveVideoProvider);
    expect(p).not.toBeInstanceOf(FakeLiveVideoProvider);
  });
});

describe('CloudflareStreamLiveVideoProvider mocked HTTP', () => {
  it('normalizes create live input and keeps WHIP/WHEP off externalRef', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: init.body, headers: init.headers });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(liveInputResult()),
      };
    });
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(allFlagsEnv()).config,
      fetchImpl,
    });
    const prepared = await provider.prepareSession({
      sessionId: 'sess_1',
      storeId: 'store_1',
      hostUserId: 'user_1',
      title: 'Pilot',
    });
    expect(prepared.externalRef).toBe('66be4bf738797e01e1fca35a7bdecdcd');
    expect(prepared.externalRef).not.toMatch(/webRTC|publish|play/i);
    expect(prepared.sensitiveCapabilities.whipPublishUrl).toBe(WHIP);
    expect(prepared.sensitiveCapabilities.whepPlaybackUrl).toBe(WHEP);
    expect(JSON.stringify(prepared.externalRef)).not.toContain('publish');

    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(calls[0].body);
    expect(body.meta.cardbeySessionId).toBe('sess_1');
    expect(body.recording.mode).toBe('off');
    expect(calls[0].url).toMatch(/\/stream\/live_inputs$/);
  });

  it('get-state normalization maps connected → live without exposing URLs', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify(
          liveInputResult({
            status: 'connected',
            uid: '66be4bf738797e01e1fca35a7bdecdcd',
          }),
        ),
    }));
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(allFlagsEnv()).config,
      fetchImpl,
    });
    const state = await provider.getSessionState({
      sessionId: 'sess_1',
      externalRef: '66be4bf738797e01e1fca35a7bdecdcd',
    });
    expect(state.status).toBe('live');
    expect(state.externalRef).toBe('66be4bf738797e01e1fca35a7bdecdcd');
    expect(JSON.stringify(state)).not.toMatch(/webRTC|publish|Bearer|whsec/i);
  });

  it('startSession does not mark LIVE from click alone', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(liveInputResult({ status: null })),
    }));
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(allFlagsEnv()).config,
      fetchImpl,
    });
    await provider.prepareSession({
      sessionId: 'sess_1',
      storeId: 'store_1',
      hostUserId: 'u',
    });
    const started = await provider.startSession({ sessionId: 'sess_1', storeId: 'store_1' });
    expect(started.status).toBe('prepared');
  });

  it('disable then delete on endSession (no mutation retry)', async () => {
    const methods = [];
    const fetchImpl = vi.fn(async (url, init) => {
      methods.push(init.method);
      if (init.method === 'POST') {
        return { ok: true, status: 200, text: async () => JSON.stringify(liveInputResult()) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, result: {} }) };
    });
    const provider = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(allFlagsEnv()).config,
      fetchImpl,
    });
    await provider.prepareSession({ sessionId: 'sess_1', storeId: 's', hostUserId: 'u' });
    const ended = await provider.endSession({ sessionId: 'sess_1', storeId: 's' });
    expect(ended.status).toBe('ended');
    expect(methods).toEqual(['POST', 'PUT', 'DELETE']);
  });

  it('maps 401/403/429/5xx to bounded codes; 404 get-state → unknown', async () => {
    for (const [status, code] of [
      [401, LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED],
      [403, LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED],
      [429, LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE],
      [503, LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE],
    ]) {
      const fetchImpl = vi.fn(async () => ({
        ok: false,
        status,
        text: async () =>
          JSON.stringify({
            errors: [{ message: `fail ${WHIP} token=${TOKEN}` }],
          }),
      }));
      const provider = createCloudflareStreamLiveVideoProvider({
        config: readCloudflareStreamConfig(allFlagsEnv()).config,
        fetchImpl,
      });
      await expect(
        provider.getSessionState({ sessionId: 's', externalRef: 'uid_1' }),
      ).rejects.toMatchObject({ code });
      try {
        await provider.getSessionState({ sessionId: 's', externalRef: 'uid_1' });
      } catch (err) {
        const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));
        expect(serialized).not.toContain(TOKEN);
        expect(serialized).not.toContain(WHIP);
        expect(serialized).not.toContain(WEBHOOK_SECRET);
        expect(String(err.message)).not.toContain(TOKEN);
      }
    }

    const notFound = createCloudflareStreamLiveVideoProvider({
      config: readCloudflareStreamConfig(allFlagsEnv()).config,
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ success: false }),
      })),
    });
    const state = await notFound.getSessionState({ sessionId: 's', externalRef: 'uid_missing' });
    expect(state.status).toBe('unknown');
  });

  it('times out and retries safe reads only', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const provider = createCloudflareStreamLiveVideoProvider({
      config: {
        ...readCloudflareStreamConfig(allFlagsEnv()).config,
        requestTimeoutMs: 50,
        readRetryCount: 1,
      },
      fetchImpl,
    });
    await expect(
      provider.getSessionState({ sessionId: 's', externalRef: 'uid_1' }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_UNAVAILABLE });
    expect(attempts).toBe(2);

    attempts = 0;
    await expect(
      provider.prepareSession({ sessionId: 's', storeId: 'st', hostUserId: 'u' }),
    ).rejects.toMatchObject({ code: LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_PREPARE_FAILED });
    // POST is not retried
    expect(attempts).toBe(1);
  });
});

describe('redaction and webhook verify', () => {
  it('redacts WHIP/WHEP and tokens', () => {
    expect(redactCloudflareCapabilityUrl(WHIP)).toBe('[REDACTED_WHIP_URL]');
    expect(redactCloudflareCapabilityUrl(WHEP)).toBe('[REDACTED_WHEP_URL]');
    const obj = redactCloudflareSecrets(
      { Authorization: `Bearer ${TOKEN}`, whip: WHIP, nested: { url: WHEP } },
      { apiToken: TOKEN, webhookSecret: WEBHOOK_SECRET },
    );
    expect(JSON.stringify(obj)).not.toContain(TOKEN);
    expect(JSON.stringify(obj)).not.toContain('publish');
  });

  it('verifies Cloudflare webhook signatures and rejects bad ones', () => {
    const body = '{"uid":"abc","status":{"state":"ready"}}';
    const time = Math.floor(Date.now() / 1000);
    const sig1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${time}.${body}`).digest('hex');
    const header = `time=${time},sig1=${sig1}`;
    expect(parseCloudflareWebhookSignatureHeader(header)).toEqual({ time: String(time), sig1 });
    expect(
      verifyCloudflareStreamWebhookSignature({
        rawBody: body,
        signatureHeader: header,
        secret: WEBHOOK_SECRET,
        nowSeconds: time,
      }).ok,
    ).toBe(true);
    expect(
      verifyCloudflareStreamWebhookSignature({
        rawBody: body,
        signatureHeader: `time=${time},sig1=deadbeef`,
        secret: WEBHOOK_SECRET,
        nowSeconds: time,
      }).ok,
    ).toBe(false);
  });

  it('normalizeCloudflareLiveInput isolates uid from capability URLs', () => {
    const n = normalizeCloudflareLiveInput(liveInputResult().result);
    expect(n.uid).toBe('66be4bf738797e01e1fca35a7bdecdcd');
    expect(n.whipPublishUrl).toContain('publish');
    expect(n.whepPlaybackUrl).toContain('play');
  });

  it('isCloudflareStreamProviderSelected requires LIVE_VIDEO_PROVIDER=cloudflare', () => {
    expect(
      isCloudflareStreamProviderSelected(allFlagsEnv({ LIVE_VIDEO_PROVIDER: 'other' }), {
        liveMarketV1: true,
        broadcastV1: true,
        cloudflareStreamV1: true,
        cloudflareWebRtcV1: true,
      }),
    ).toBe(false);
  });
});
