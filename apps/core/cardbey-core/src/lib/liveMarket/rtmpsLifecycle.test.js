import { describe, expect, it, beforeEach } from 'vitest';
import { FakeLiveVideoProvider } from './providers.js';
import {
  assertSessionTransition,
  PUBLIC_PLAYBACK_STATE,
  STOREFRONT_PUBLICATION_STATUS,
  toPublicPlaybackState,
} from './domain.js';
import { buildPublicPlaybackDto } from './publicPlayback.js';
import {
  assertCloudflareNotificationsAuth,
  verifyCloudflareNotificationsAuth,
} from './providers/cloudflareNotificationsAuth.js';

describe('RTMPS lifecycle invariants', () => {
  it('owner path cannot transition READY → LIVE', () => {
    expect(assertSessionTransition('READY', 'LIVE').ok).toBe(false);
    expect(assertSessionTransition('READY', 'CONNECTING').ok).toBe(true);
    expect(assertSessionTransition('CONNECTING', 'LIVE').ok).toBe(true);
  });

  it('end path moves LIVE → ENDING → ENDED', () => {
    expect(assertSessionTransition('LIVE', 'ENDING').ok).toBe(true);
    expect(assertSessionTransition('ENDING', 'ENDED').ok).toBe(true);
    expect(assertSessionTransition('CONNECTING', 'ENDING').ok).toBe(true);
  });

  it('public playback requires published + confirmed LIVE + player urls', () => {
    const waiting = buildPublicPlaybackDto(
      {
        id: 's1',
        state: 'READY',
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
        providerExternalRef: 'uid-1',
      },
      {
        providerConfirmedLive: false,
        customerCode: 'customer',
        playerEnabled: true,
      },
    );
    expect(waiting.playbackState).toBe(PUBLIC_PLAYBACK_STATE.WAITING);
    expect(waiting.player).toBeNull();

    const live = buildPublicPlaybackDto(
      {
        id: 's1',
        state: 'LIVE',
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
        providerExternalRef: 'uid-1',
        startedAt: new Date().toISOString(),
      },
      {
        providerConfirmedLive: true,
        customerCode: 'customer',
        playerEnabled: true,
      },
    );
    expect(live.playbackState).toBe(PUBLIC_PLAYBACK_STATE.LIVE);
    expect(live.player?.iframeSrc).toContain('cloudflarestream.com');
    expect(JSON.stringify(live)).not.toMatch(/rtmps|streamKey|apiToken|accountId/i);

    const withdrawnState = toPublicPlaybackState(
      {
        state: 'LIVE',
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
      },
      { providerConfirmedLive: true, playerEnabled: true },
    );
    expect(withdrawnState).toBe(PUBLIC_PLAYBACK_STATE.UNAVAILABLE);
  });
});

describe('Cloudflare notifications cf-webhook-auth', () => {
  const secret = 'good-secret';

  it('accepts matching cf-webhook-auth', () => {
    expect(
      verifyCloudflareNotificationsAuth({
        headers: { 'cf-webhook-auth': secret },
        secret,
      }).ok,
    ).toBe(true);
  });

  it('rejects incorrect or missing secret', () => {
    expect(
      verifyCloudflareNotificationsAuth({
        headers: { 'cf-webhook-auth': 'bad' },
        secret,
      }).ok,
    ).toBe(false);
    expect(
      verifyCloudflareNotificationsAuth({
        headers: {},
        secret,
      }).ok,
    ).toBe(false);
    expect(() =>
      assertCloudflareNotificationsAuth({
        headers: { 'cf-webhook-auth': 'bad' },
        secret,
      }),
    ).toThrow();
  });

  it('rejects when webhook secret is not configured', () => {
    const result = verifyCloudflareNotificationsAuth({
      headers: { 'cf-webhook-auth': secret },
      secret: '',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_secret');
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
    await fake.prepareSession({
      sessionId: 'sess_flow',
      storeId: 'store_1',
      hostUserId: 'host_1',
    });
    const connecting = await fake.startSession({
      sessionId: 'sess_flow',
      storeId: 'store_1',
    });
    expect(connecting.status).toBe('connecting'); // fake start-intent never marks live

    expect(assertSessionTransition('CONNECTING', 'LIVE').ok).toBe(true);
    expect(assertSessionTransition('LIVE', 'ENDING').ok).toBe(true);
    expect(assertSessionTransition('ENDING', 'ENDED').ok).toBe(true);

    const liveState = fake.confirmConnected('sess_flow');
    expect(liveState.status).toBe('live');

    await fake.endSession({ sessionId: 'sess_flow', storeId: 'store_1' });
    const ended = await fake.getSessionState({ sessionId: 'sess_flow' });
    expect(ended.status).toBe('ended');
    expect(session.state).toBe('CONNECTING');
  });
});
