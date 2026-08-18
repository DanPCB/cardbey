import { describe, expect, it } from 'vitest';
import {
  LIVE_CNET_EVENTS,
  LIVE_CNET_METRIC_KEYS,
  applyDeviceOfflineHealth,
  assertNoInternalIdsInDestination,
  buildStorefrontHandoffPath,
  classifyPlaybackMode,
  eventIdempotencyDedupeKey,
  impressionDedupeKey,
  isDeviceOnline,
  isPublicRefSafe,
  metricsFromEventRows,
  newPublicRef,
  placementInWindow,
  qrScanDedupeKey,
} from './domain.js';

describe('liveCnet domain', () => {
  it('issues public refs that are not Prisma-looking cuids', () => {
    const ref = newPublicRef('glc');
    expect(isPublicRefSafe(ref)).toBe(true);
    expect(ref.startsWith('glc_')).toBe(true);
    expect(isPublicRefSafe('clxxxxxxxxxxxxxxxxxxxxxxx')).toBe(false);
  });

  it('builds storefront handoff without internal ids', () => {
    const path = buildStorefrontHandoffPath({
      storeSlug: 'demo-store',
      campaignPublicRef: 'glc_abc',
      placementPublicCode: 'glp_def',
      devicePublicCode: 'gld_ghi',
      attributionToken: 'glt_jkl',
    });
    expect(path).toContain('/s/demo-store');
    expect(path).toContain('#live');
    expect(path).not.toMatch(/deviceId|sessionId|storeId/);
    assertNoInternalIdsInDestination(`https://app.example${path}`);
  });

  it('rejects destinations that leak internal ids', () => {
    expect(() =>
      assertNoInternalIdsInDestination('https://x.example/s/a?deviceId=abc#live'),
    ).toThrow(/internal/i);
  });

  it('keeps metric keys separate and never infers viewers', () => {
    const metrics = metricsFromEventRows([
      { eventType: LIVE_CNET_EVENTS.SCREEN_IMPRESSION },
      { eventType: LIVE_CNET_EVENTS.SCREEN_IMPRESSION },
      { eventType: LIVE_CNET_EVENTS.QR_SCAN },
      { eventType: LIVE_CNET_EVENTS.REGISTRATION },
      { eventType: LIVE_CNET_EVENTS.ONLINE_JOIN },
    ]);
    expect(metrics.screenPlays).toBe(2);
    expect(metrics.qrScans).toBe(1);
    expect(metrics.registrations).toBe(1);
    expect(metrics.onlineJoins).toBe(1);
    expect(metrics.storeActions).toBe(0);
    const viewerish = metrics.screenPlays + metrics.qrScans + metrics.registrations;
    expect(viewerish).not.toBe(metrics.onlineJoins);
    expect(LIVE_CNET_METRIC_KEYS).toEqual([
      'screenPlays',
      'qrScans',
      'registrations',
      'onlineJoins',
      'storeActions',
    ]);
  });

  it('filters placement schedule windows', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');
    expect(
      placementInWindow({ validFrom: '2026-08-17T11:00:00.000Z', validUntil: '2026-08-17T13:00:00.000Z' }, now),
    ).toBe(true);
    expect(
      placementInWindow({ validFrom: '2026-08-17T13:00:00.000Z' }, now),
    ).toBe(false);
  });

  it('dedupes screen impressions per device/campaign/minute', () => {
    expect(
      impressionDedupeKey({
        devicePublicCode: 'gld_1',
        campaignPublicRef: 'glc_1',
        minuteBucket: 10,
      }),
    ).toBe('imp:glc_1:gld_1:10');
  });

  it('classifies HLS, live-card fallback, expired, withdrawn and offline separately', () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    expect(
      classifyPlaybackMode({
        sessionState: 'LIVE',
        hlsUrl: 'https://customer-x.cloudflarestream.com/u/manifest/video.m3u8',
        campaignStatus: 'ACTIVE',
        placement: {},
        now,
      }),
    ).toMatchObject({ playbackMode: 'hls', health: 'ACTIVE_HLS' });
    expect(
      classifyPlaybackMode({
        sessionState: 'LIVE',
        hlsUrl: null,
        campaignStatus: 'ACTIVE',
        placement: {},
        now,
      }),
    ).toMatchObject({ playbackMode: 'live_card', health: 'STREAM_UNAVAILABLE' });
    expect(
      classifyPlaybackMode({
        sessionState: 'CONNECTING',
        hlsUrl: null,
        campaignStatus: 'ACTIVE',
        placement: { validFrom: '2026-08-18T13:00:00.000Z' },
        now,
      }).health,
    ).toBe('SCHEDULE_PENDING');
    expect(
      classifyPlaybackMode({
        sessionState: 'CONNECTING',
        hlsUrl: null,
        campaignStatus: 'ACTIVE',
        placement: { validUntil: '2026-08-18T11:00:00.000Z' },
        now,
      }).health,
    ).toBe('SCHEDULE_EXPIRED');
    expect(
      classifyPlaybackMode({
        sessionState: 'LIVE',
        hlsUrl: 'https://x/m.m3u8',
        campaignStatus: 'ACTIVE',
        placement: { withdrawnAt: now },
        now,
      }).health,
    ).toBe('WITHDRAWN');
    expect(applyDeviceOfflineHealth('ACTIVE_HLS', false)).toBe('DEVICE_OFFLINE');
    expect(isDeviceOnline(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(isDeviceOnline(new Date(now.getTime() - 10 * 60 * 1000), now)).toBe(false);
  });

  it('keeps QR scan and idempotency keys stable for retries', () => {
    expect(qrScanDedupeKey({ attributionToken: 'glt_1', minuteBucket: 4 })).toBe('qr:glt_1:4');
    expect(
      eventIdempotencyDedupeKey({
        eventType: 'LIVE_CNET_STORE_ACTION',
        attributionToken: 'glt_1',
        idempotencyKey: 'tap-1',
      }),
    ).toBe('idk:LIVE_CNET_STORE_ACTION:glt_1:tap-1');
  });
});
