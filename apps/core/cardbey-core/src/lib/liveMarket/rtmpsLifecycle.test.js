import { describe, expect, it, beforeEach } from 'vitest';
import { FakeLiveVideoProvider } from './providers.js';
import {
  assertSessionTransition,
  toPublicPlaybackDto,
  PUBLIC_PLAYBACK_STATE,
  STOREFRONT_PUBLICATION_STATUS,
} from './domain.js';
import {
  __resetLiveReconcileStateForTests,
  handleCloudflareLiveInputWebhook,
} from './reconcile.js';

describe('RTMPS lifecycle invariants', () => {
  beforeEach(() => {
    __resetLiveReconcileStateForTests();
  });

  it('owner path cannot transition READY → LIVE', () => {
    expect(assertSessionTransition('READY', 'LIVE').ok).toBe(false);
    expect(assertSessionTransition('READY', 'CONNECTING').ok).toBe(true);
    expect(assertSessionTransition('CONNECTING', 'LIVE').ok).toBe(true);
  });

  it('public playback requires published + confirmed LIVE + playerUrl', () => {
    const waiting = toPublicPlaybackDto({
      session: {
        id: 's1',
        state: 'READY',
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
      },
      providerConfirmedLive: false,
      playerUrl: null,
      consumeEnabled: true,
    });
    expect(waiting.state).toBe(PUBLIC_PLAYBACK_STATE.WAITING);
    expect(waiting.live).toBe(false);

    const live = toPublicPlaybackDto({
      session: {
        id: 's1',
        state: 'LIVE',
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
        startedAt: new Date().toISOString(),
      },
      providerConfirmedLive: true,
      playerUrl: 'https://customer-x.cloudflarestream.com/uid/iframe',
      consumeEnabled: true,
    });
    expect(live.state).toBe(PUBLIC_PLAYBACK_STATE.LIVE);
    expect(live.live).toBe(true);
    expect(JSON.stringify(live)).not.toMatch(/rtmps|streamKey|account|token/i);

    const withdrawn = toPublicPlaybackDto({
      session: {
        id: 's1',
        state: 'LIVE',
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
      },
      providerConfirmedLive: true,
      playerUrl: 'https://example/player',
      consumeEnabled: true,
    });
    expect(withdrawn.state).toBe(PUBLIC_PLAYBACK_STATE.UNAVAILABLE);
    expect(withdrawn.playerUrl).toBeNull();
  });

  it('notifications auth rejects bad secret without revealing session', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_BROADCAST_V1 = 'true';
    process.env.ENABLE_LIVE_CLOUDFLARE_STREAM_V1 = 'true';
    process.env.CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH = 'good-secret';
    await expect(
      handleCloudflareLiveInputWebhook({
        headers: { 'cf-webhook-auth': 'bad' },
        body: {
          data: { input_id: 'unknown', event_type: 'live_input.connected', updated_at: 't' },
        },
        env: process.env,
      }),
    ).rejects.toMatchObject({ code: 'LIVE_PROVIDER_EVENT_INVALID' });
  });
});

describe('Fake provider lifecycle with service helpers', () => {
  it('prepare → start-intent CONNECTING → confirm LIVE → disconnect ENDED', async () => {
    const fake = new FakeLiveVideoProvider();
    const session = {
      id: 'sess_flow',
      storeId: 'store_1',
      state: 'CONNECTING',
      providerExternalRef: 'fake:sess_flow',
      startedAt: null,
    };
    fake.simulateConnected('sess_flow', false);
    // Direct confirm helpers (bypass prisma) — transition rules only
    expect(assertSessionTransition('CONNECTING', 'LIVE').ok).toBe(true);
    expect(assertSessionTransition('LIVE', 'ENDING').ok).toBe(true);
    expect(assertSessionTransition('ENDING', 'ENDED').ok).toBe(true);

    const liveState = fake.simulateConnected('sess_flow', true);
    expect(liveState.status).toBe('live');

    await fake.endSession({ sessionId: 'sess_flow', storeId: 'store_1' });
    const ended = await fake.getSessionState({ sessionId: 'sess_flow' });
    expect(ended.status).toBe('ended');
    expect(session.state).toBe('CONNECTING'); // session object untouched without prisma
  });
});
