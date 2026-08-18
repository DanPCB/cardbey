import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Features } from '../../config/features.js';
import {
  getCampaignAnalytics,
  listEligibleDevices,
  previewCampaign,
  projectPublicManifest,
  withdrawPlacement,
} from './operator.js';

const FLAG_KEYS = ['ENABLE_LIVE_MARKET_V1', 'ENABLE_LIVE_CNET_CONTRACT_V1'];

function placementFixture(overrides = {}) {
  return {
    id: 'p1',
    publicRef: 'glp_1',
    deviceId: 'dev1',
    devicePublicCode: 'gld_1',
    attributionToken: 'glt_1',
    locationLabel: 'Window',
    validFrom: null,
    validUntil: null,
    withdrawnAt: null,
    ...overrides,
  };
}

function campaignFixture(placement = placementFixture()) {
  return {
    id: 'c1',
    publicRef: 'glc_1',
    liveSessionPublicRef: 'gls_1',
    liveSessionId: 'sess1',
    storeId: 's1',
    storeSlug: 'demo-store',
    status: 'ACTIVE',
    creativeVersion: 1,
    placements: [placement],
    liveSession: {
      title: 'Lunch special',
      state: 'CONNECTING',
      storefrontPublicationStatus: 'PUBLISHED',
      providerExternalRef: 'uid_live',
    },
  };
}

describe('liveCnet operator', () => {
  const prev = {};

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('lists paired store devices without pairing secrets', async () => {
    const prisma = {
      device: {
        findMany: vi.fn(async () => [
          {
            id: 'dev1',
            name: 'Front window',
            platform: 'webos',
            status: 'online',
            lastSeenAt: new Date(),
            location: 'Window',
            pairingCode: 'SECRET',
          },
        ]),
      },
    };
    const devices = await listEligibleDevices({ prisma, storeId: 's1' });
    expect(devices[0].deviceId).toBe('dev1');
    expect(devices[0].displayName).toBe('Front window');
    expect(JSON.stringify(devices)).not.toMatch(/SECRET|pairingCode|screenshot/i);
  });

  it('previews timed live card and QR destination without claiming LIVE', async () => {
    const campaign = campaignFixture();
    const prisma = {
      globalLiveCnetCampaign: {
        findFirst: vi.fn(async () => campaign),
      },
      device: {
        findMany: vi.fn(async () => [{ id: 'dev1', lastSeenAt: new Date(), name: 'TV' }]),
      },
    };
    const preview = await previewCampaign({ prisma, storeId: 's1', publicRef: 'glc_1' });
    expect(preview.placements[0].playbackMode).toBe('live_card');
    expect(preview.placements[0].providerConfirmedLive).toBe(false);
    expect(preview.placements[0].liveCard.destinationUrl).toContain('/api/public/live-cnet/h/glt_1');
    expect(JSON.stringify(preview)).not.toMatch(/deviceId|sessionId|storeId=|whip|rtmps/i);
  });

  it('withdraws a placement so overlay health is WITHDRAWN', async () => {
    const withdrawnAt = new Date('2026-08-18T12:00:00.000Z');
    const campaign = campaignFixture();
    const prisma = {
      globalLiveCnetCampaign: {
        findFirst: vi.fn(async () => ({
          ...campaign,
          placements: [{ ...campaign.placements[0], withdrawnAt }],
        })),
      },
      globalLiveCnetPlacement: {
        update: vi.fn(async ({ data }) => {
          expect(data.withdrawnAt).toBeInstanceOf(Date);
          return { ...campaign.placements[0], ...data };
        }),
      },
    };
    const result = await withdrawPlacement({
      prisma,
      storeId: 's1',
      campaignPublicRef: 'glc_1',
      placementPublicCode: 'glp_1',
    });
    expect(prisma.globalLiveCnetPlacement.update).toHaveBeenCalled();
    expect(result.placements[0].withdrawnAt).toBeTruthy();
  });

  it('projects a public manifest without recording an impression', async () => {
    const prisma = {
      globalLiveCnetPlacement: {
        findUnique: vi.fn(async () => ({
          ...placementFixture(),
          campaign: campaignFixture().liveSession
            ? { ...campaignFixture(), liveSession: campaignFixture().liveSession }
            : campaignFixture(),
        })),
        findMany: vi.fn(async () => {
          throw new Error('playlist overlay must not run for public manifest');
        }),
      },
      globalLiveCnetEvent: {
        create: vi.fn(async () => {
          throw new Error('manifest projection must not write events');
        }),
      },
    };
    prisma.globalLiveCnetPlacement.findUnique = vi.fn(async () => ({
      ...placementFixture(),
      campaign: campaignFixture(),
    }));
    const projection = await projectPublicManifest({ prisma, token: 'glt_1' });
    expect(projection.item.type).toBe('live_card');
    expect(projection.item.health).toBe('ACTIVE_LIVE_CARD');
    expect(projection.item.qrValue).toContain('/live-cnet/h/glt_1');
    expect(prisma.globalLiveCnetEvent.create).not.toHaveBeenCalled();
  });

  it('returns analytics counters without a combined viewers field', async () => {
    const campaign = campaignFixture();
    const prisma = {
      globalLiveCnetCampaign: {
        findFirst: vi.fn(async () => campaign),
      },
      globalLiveCnetEvent: {
        findMany: vi.fn(async () => [
          { eventType: 'LIVE_CNET_SCREEN_IMPRESSION', attributionToken: 'glt_1' },
          { eventType: 'LIVE_CNET_REGISTRATION', attributionToken: 'glt_1' },
          { eventType: 'LIVE_CNET_ONLINE_JOIN', attributionToken: 'glt_1' },
        ]),
      },
    };
    const analytics = await getCampaignAnalytics({ prisma, storeId: 's1', publicRef: 'glc_1' });
    expect(analytics.registrations).toBe(1);
    expect(analytics.onlineViewers).toBe(1);
    expect(analytics.screenPlays).toBe(1);
    expect(analytics.neverCombined).toBe(true);
    expect(analytics).not.toHaveProperty('viewers');
    expect(analytics.registrations + analytics.onlineViewers + analytics.screenPlays).not.toBe(
      analytics.onlineViewers,
    );
  });

  it('marks assignment health DEVICE_OFFLINE from heartbeat, not from public projection', async () => {
    const campaign = campaignFixture();
    const prisma = {
      globalLiveCnetCampaign: {
        findFirst: vi.fn(async () => campaign),
      },
      device: {
        findMany: vi.fn(async () => [
          { id: 'dev1', lastSeenAt: new Date('2020-01-01T00:00:00Z'), name: 'TV' },
        ]),
      },
    };
    const preview = await previewCampaign({ prisma, storeId: 's1', publicRef: 'glc_1' });
    expect(preview.placements[0].health).toBe('DEVICE_OFFLINE');
    expect(preview.placements[0].deviceOnline).toBe(false);
  });
});
