import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Features } from '../../config/features.js';
import { LIVE_CNET_EVENTS } from './domain.js';
import { createCampaign, prependLiveCnetOverlayItems, recordContractEvent } from './service.js';

const FLAG_KEYS = ['ENABLE_LIVE_MARKET_V1', 'ENABLE_LIVE_CNET_CONTRACT_V1'];

describe('liveCnet service', () => {
  const prev = {};

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('refuses writes when contract flag is off', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    expect(Features.liveMarket.cnetContractV1).toBe(false);
    await expect(
      createCampaign({ storeId: 's1', sessionId: 'sess1', hostUserId: 'u1' }),
    ).rejects.toMatchObject({ code: 'LIVE_CNET_DISABLED' });
  });

  it('creates one campaign per session with public refs only', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
    const prisma = {
      liveMarketSession: {
        findFirst: vi.fn(async () => ({ id: 'sess1', storeId: 's1', title: 'Demo' })),
      },
      business: {
        findUnique: vi.fn(async () => ({ id: 's1', slug: 'demo-store' })),
      },
      globalLiveCnetCampaign: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ ...data, id: 'camp1', placements: [] })),
      },
    };
    const campaign = await createCampaign({
      prisma,
      storeId: 's1',
      sessionId: 'sess1',
      hostUserId: 'u1',
    });
    expect(campaign.publicRef.startsWith('glc_')).toBe(true);
    expect(campaign.liveSessionPublicRef.startsWith('gls_')).toBe(true);
    expect(campaign.storePublicRef).toBe('demo-store');
    expect(campaign.storeId).toBeUndefined();
    expect(campaign.liveSessionId).toBeUndefined();
    expect(JSON.stringify(campaign)).not.toMatch(/sess1/);
  });

  it('leaves playlist items unchanged when overlay is absent', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
    const items = [{ id: 'a', type: 'image', url: 'https://cdn.example/a.jpg' }];
    const prisma = {
      globalLiveCnetPlacement: { findMany: vi.fn(async () => []) },
    };
    const next = await prependLiveCnetOverlayItems({ prisma, deviceId: 'dev1', items });
    expect(next).toEqual(items);
  });

  it('prepends live_hls when session is LIVE with playback url', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
    process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = 'abc123';
    const prisma = {
      globalLiveCnetPlacement: {
        findMany: vi.fn(async () => [
          {
            publicRef: 'glp_1',
            deviceId: 'dev1',
            devicePublicCode: 'gld_1',
            attributionToken: 'glt_1',
            campaign: {
              publicRef: 'glc_1',
              liveSessionPublicRef: 'gls_1',
              storeSlug: 'demo-store',
              status: 'ACTIVE',
              creativeVersion: 1,
              liveSession: {
                title: 'Lunch special',
                state: 'LIVE',
                storefrontPublicationStatus: 'PUBLISHED',
                providerExternalRef: 'uid_live',
              },
            },
          },
        ]),
      },
      globalLiveCnetEvent: {
        create: vi.fn(async () => ({ id: 'e1' })),
      },
    };
    const next = await prependLiveCnetOverlayItems({
      prisma,
      deviceId: 'dev1',
      items: [{ id: 'promo', type: 'image', url: 'https://cdn.example/p.jpg' }],
    });
    expect(next[0].type).toBe('live_hls');
    expect(next[0].url).toMatch(/\.m3u8$/);
    expect(next[0].url).not.toMatch(/whip|rtmps|streamKey/i);
    expect(next[0].qrValue).toContain('/api/public/live-cnet/h/glt_1');
    expect(next[1].id).toBe('promo');
  });

  it('records registration against a token without throwing on duplicate', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
    const prisma = {
      globalLiveCnetPlacement: {
        findUnique: vi.fn(async () => ({
          id: 'p1',
          publicRef: 'glp_1',
          devicePublicCode: 'gld_1',
          attributionToken: 'glt_1',
          campaign: {
            id: 'c1',
            publicRef: 'glc_1',
            liveSessionPublicRef: 'gls_1',
            storeSlug: 'demo-store',
            creativeVersion: 1,
            liveSession: { id: 'sess' },
          },
        })),
      },
      globalLiveCnetEvent: {
        create: vi.fn(async () => {
          const err = new Error('dup');
          err.code = 'P2002';
          throw err;
        }),
      },
    };
    const result = await recordContractEvent({
      prisma,
      eventType: LIVE_CNET_EVENTS.REGISTRATION,
      attributionToken: 'glt_1',
    });
    expect(result.recorded).toBe(false);
    expect(result.duplicate).toBe(true);
  });

  it('uses an idempotency key as the event dedupe key', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
    const prisma = {
      globalLiveCnetPlacement: {
        findUnique: vi.fn(async () => ({
          id: 'p1',
          publicRef: 'glp_1',
          devicePublicCode: 'gld_1',
          attributionToken: 'glt_1',
          campaign: {
            id: 'c1',
            publicRef: 'glc_1',
            liveSessionPublicRef: 'gls_1',
            storeSlug: 'demo-store',
            creativeVersion: 1,
            liveSession: { id: 'sess' },
          },
        })),
      },
      globalLiveCnetEvent: {
        create: vi.fn(async ({ data }) => data),
      },
    };
    await recordContractEvent({
      prisma,
      eventType: LIVE_CNET_EVENTS.ONLINE_JOIN,
      attributionToken: 'glt_1',
      idempotencyKey: 'join-once',
    });
    expect(prisma.globalLiveCnetEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dedupeKey: 'idk:LIVE_CNET_ONLINE_JOIN:glt_1:join-once',
        }),
      }),
    );
  });

  it('falls back to live_card when LIVE but HLS URL is missing', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
    delete process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
    const prisma = {
      globalLiveCnetPlacement: {
        findMany: vi.fn(async () => [
          {
            publicRef: 'glp_1',
            deviceId: 'dev1',
            devicePublicCode: 'gld_1',
            attributionToken: 'glt_1',
            campaign: {
              publicRef: 'glc_1',
              liveSessionPublicRef: 'gls_1',
              storeSlug: 'demo-store',
              status: 'ACTIVE',
              creativeVersion: 1,
              liveSession: {
                title: 'Lunch special',
                state: 'LIVE',
                storefrontPublicationStatus: 'PUBLISHED',
                providerExternalRef: 'uid_live',
              },
            },
          },
        ]),
      },
      globalLiveCnetEvent: { create: vi.fn(async () => ({ id: 'e1' })) },
    };
    const next = await prependLiveCnetOverlayItems({
      prisma,
      deviceId: 'dev1',
      items: [{ id: 'promo', type: 'image', url: 'https://cdn.example/p.jpg' }],
    });
    expect(next[0].type).toBe('live_card');
    expect(next[0].health).toBe('STREAM_UNAVAILABLE');
    expect(next[0].url).toContain('/api/public/live-cnet/h/glt_1');
  });
});
