/**
 * Exact compact liveMarket feed-card contract.
 * Null provider/playback fields are omitted; secrets never appear.
 */

import { describe, expect, it } from 'vitest';
import {
  STOREFRONT_PUBLICATION_STATUS,
  sanitizePublicFeedPlayback,
  toPublicFeedLiveMarketSummary,
} from './domain.js';
import { buildPublicPlaybackDto } from './publicPlayback.js';

const TZ = 'Australia/Sydney';
const WHEN = '2029-10-10T00:11:00.000Z';

function published(overrides = {}) {
  return {
    id: 'sess_1',
    title: 'test Live',
    scheduledStartAt: WHEN,
    storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
    state: 'SCHEDULED',
    providerExternalRef: 'uid_live_1',
    ...overrides,
  };
}

describe('compact liveMarket feed DTO', () => {
  it('1 scheduled / not connected keeps the five-field compact shape', () => {
    const dto = toPublicFeedLiveMarketSummary(published(), {
      displayTimezone: TZ,
      providerConfirmedLive: false,
      playback: { playbackState: 'WAITING', providerConfirmedLive: false, player: null },
    });
    expect(dto).toEqual({
      sessionId: 'sess_1',
      title: 'test Live',
      scheduledAt: WHEN,
      timezone: TZ,
      publicState: 'upcoming',
    });
  });

  it('2 connecting omits playback and false provider flags', () => {
    const dto = toPublicFeedLiveMarketSummary(published({ state: 'CONNECTING' }), {
      displayTimezone: TZ,
      providerConfirmedLive: false,
      playback: { playbackState: 'CONNECTING', providerConfirmedLive: false, player: null },
    });
    expect(dto).toEqual({
      sessionId: 'sess_1',
      title: 'test Live',
      scheduledAt: WHEN,
      timezone: TZ,
      publicState: 'connecting',
    });
  });

  it('3 provider-confirmed LIVE includes public-safe playback only', () => {
    const session = published({ state: 'LIVE' });
    const playback = buildPublicPlaybackDto(session, {
      playerEnabled: true,
      customerCode: 'abc123',
      providerConfirmedLive: true,
    });
    const dto = toPublicFeedLiveMarketSummary(session, {
      displayTimezone: TZ,
      providerConfirmedLive: true,
      playerEnabled: true,
      playback,
    });
    expect(dto).toEqual({
      sessionId: 'sess_1',
      title: 'test Live',
      scheduledAt: WHEN,
      timezone: TZ,
      publicState: 'live',
      providerConfirmedLive: true,
      playback: {
        playbackState: 'LIVE',
        providerConfirmedLive: true,
        player: {
          provider: 'cloudflare_stream',
          hlsUrl: 'https://customer-abc123.cloudflarestream.com/uid_live_1/manifest/video.m3u8',
          iframeSrc: 'https://customer-abc123.cloudflarestream.com/uid_live_1/iframe',
        },
      },
    });
  });

  it('4 withdrawn is omitted from the feed', () => {
    expect(
      toPublicFeedLiveMarketSummary(
        published({ storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN, state: 'LIVE' }),
        { providerConfirmedLive: true, displayTimezone: TZ },
      ),
    ).toBeNull();
  });

  it('5 cancelled is omitted from the feed', () => {
    expect(
      toPublicFeedLiveMarketSummary(published({ state: 'CANCELLED' }), {
        providerConfirmedLive: false,
        displayTimezone: TZ,
      }),
    ).toBeNull();
  });

  it('6 confirmed LIVE with missing provider still omits media URLs', () => {
    const session = published({ state: 'LIVE', providerExternalRef: '' });
    const playback = buildPublicPlaybackDto(session, {
      playerEnabled: true,
      customerCode: null,
      providerConfirmedLive: true,
    });
    const dto = toPublicFeedLiveMarketSummary(session, {
      displayTimezone: TZ,
      providerConfirmedLive: true,
      playerEnabled: true,
      playback,
    });
    expect(dto).toEqual({
      sessionId: 'sess_1',
      title: 'test Live',
      scheduledAt: WHEN,
      timezone: TZ,
      publicState: 'live',
      providerConfirmedLive: true,
      playback: {
        playbackState: 'LIVE',
        providerConfirmedLive: true,
        player: { provider: 'cloudflare_stream' },
      },
    });
  });

  it('7 player flags off omit playback even when LIVE', () => {
    const session = published({ state: 'LIVE' });
    const playback = buildPublicPlaybackDto(session, {
      playerEnabled: true,
      customerCode: 'abc123',
      providerConfirmedLive: true,
    });
    const dto = toPublicFeedLiveMarketSummary(session, {
      displayTimezone: TZ,
      providerConfirmedLive: true,
      playerEnabled: false,
      playback,
    });
    expect(dto).toEqual({
      sessionId: 'sess_1',
      title: 'test Live',
      scheduledAt: WHEN,
      timezone: TZ,
      publicState: 'live',
      providerConfirmedLive: true,
    });
  });

  it('8 scrubs secrets from a poisoned playback payload', () => {
    const session = published({ state: 'LIVE' });
    const dto = toPublicFeedLiveMarketSummary(session, {
      displayTimezone: TZ,
      providerConfirmedLive: true,
      playerEnabled: true,
      playback: {
        playbackState: 'LIVE',
        providerConfirmedLive: true,
        rtmpsUrl: 'rtmps://live.cloudflare.com/live',
        rtmpsStreamKey: 'secret-stream-key',
        streamKey: 'secret-stream-key',
        accountId: 'cf-account',
        apiToken: 'cf-token',
        webhookSecret: 'whsec_secret',
        providerError: 'internal boom',
        player: {
          provider: 'cloudflare_stream',
          hlsUrl: 'https://customer-abc123.cloudflarestream.com/uid_live_1/manifest/video.m3u8',
          iframeSrc: 'https://customer-abc123.cloudflarestream.com/uid_live_1/iframe',
          whipUrl: 'https://customer-abc123.cloudflarestream.com/uid_live_1/webRTC/publish',
        },
      },
    });
    const json = JSON.stringify(dto);
    expect(json).not.toContain('rtmps://');
    expect(json).not.toContain('secret-stream-key');
    expect(json).not.toContain('cf-account');
    expect(json).not.toContain('cf-token');
    expect(json).not.toContain('whsec_secret');
    expect(json).not.toContain('internal boom');
    expect(json).not.toContain('webRTC/publish');
    expect(dto).toEqual({
      sessionId: 'sess_1',
      title: 'test Live',
      scheduledAt: WHEN,
      timezone: TZ,
      publicState: 'live',
      providerConfirmedLive: true,
      playback: {
        playbackState: 'LIVE',
        providerConfirmedLive: true,
        player: {
          provider: 'cloudflare_stream',
          hlsUrl: 'https://customer-abc123.cloudflarestream.com/uid_live_1/manifest/video.m3u8',
          iframeSrc: 'https://customer-abc123.cloudflarestream.com/uid_live_1/iframe',
        },
      },
    });
  });
});

describe('sanitizePublicFeedPlayback', () => {
  it('drops non-LIVE and forbidden media URLs', () => {
    expect(sanitizePublicFeedPlayback({ playbackState: 'CONNECTING', player: { provider: 'x' } })).toBeUndefined();
    expect(
      sanitizePublicFeedPlayback({
        playbackState: 'LIVE',
        player: { hlsUrl: 'rtmps://live.example/app' },
      }),
    ).toEqual({ playbackState: 'LIVE' });
  });
});
