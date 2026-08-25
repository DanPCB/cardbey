import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createTrackedDestination, recordTouch } from '../attributionService.js';
import { resolveMarketingPermissions, hasMarketingPermission, PERMISSIONS } from '../permissions.js';
import { Features, snapshotFeatures } from '../../../config/features.js';
import { createMetaFacebookPageProvider } from '../publishing/MetaFacebookPageProvider.js';

vi.mock('../repository.js', () => ({
  marketingRepo: {
    objective: {
      findFirst: async () => null,
      create: async (data) => ({ id: 'obj_default', status: 'ACTIVE', ...data }),
    },
    attributionTouch: {
      create: async (data) => ({ id: 'touch1', ...data }),
    },
    campaign: {
      findFirst: async () => null,
      create: async (data) => ({ id: 'camp_seed', ...data, contentItems: [] }),
      update: async ({ data }) => data,
      findUnique: async () => ({
        id: 'camp_seed',
        contentItems: [],
        metadata: { targetType: 'USER_ACQUISITION', channel: 'facebook' },
        targetType: 'USER_ACQUISITION',
        channel: 'facebook',
      }),
    },
    content: {
      create: async (data) => ({ id: `c_${Math.random()}`, status: data.status, ...data }),
    },
    version: {
      create: async (data) => data,
    },
  },
}));

vi.mock('../audit.js', () => ({
  appendMarketingAudit: async () => {},
}));

import { seedPilotCampaign } from '../seedPilot.js';

describe('marketingOperator/attribution + permissions + flags + seed', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete process.env.ENABLE_MARKETING_OPERATOR_V1;
    delete process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1;
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('creates tracked destination with attribution params', () => {
    const dest = createTrackedDestination({
      baseUrl: 'https://cardbey.com/pilot',
      campaignId: 'camp1',
      contentId: 'c1',
      channel: 'facebook',
      source: 'organic',
      placement: 'feed',
      creativeVersion: 2,
    });
    expect(dest.ok).toBe(true);
    expect(dest.url).toContain('campaignId=camp1');
    expect(dest.url).toContain('creativeVersion=2');
    expect(dest.url).toContain('utm_source=organic');
    expect(dest.url).toContain('utm_medium=social');
    expect(dest.url).toContain('utm_campaign=camp1');
    expect(dest.windows.CLICK_DAYS).toBe(7);
  });

  it('records attribution touch', async () => {
    const result = await recordTouch({
      campaignId: 'camp1',
      contentId: 'c1',
      channel: 'facebook',
      visitorKey: 'v1',
    });
    expect(result.ok).toBe(true);
    expect(result.touch.id).toBe('touch1');
  });

  it('maps platform admins to full marketing permissions', () => {
    const perms = resolveMarketingPermissions({ role: 'platform_admin' });
    expect(perms).toContain(PERMISSIONS.MARKETING_PUBLISHER);
    expect(hasMarketingPermission({ role: 'super_admin' }, PERMISSIONS.MARKETING_APPROVER)).toBe(
      true,
    );
    expect(hasMarketingPermission({ role: 'viewer' }, PERMISSIONS.MARKETING_EDITOR)).toBe(false);
  });

  it('kill switch: marketing flags default false', () => {
    delete process.env.ENABLE_MARKETING_OPERATOR_V1;
    delete process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1;
    delete process.env.ENABLE_FACEBOOK_RESPONSE_SENDING_V1;
    expect(Features.marketingOperator.v1).toBe(false);
    expect(Features.marketingOperator.livePublishingV1).toBe(false);
    expect(Features.marketingOperator.responseSendingV1).toBe(false);
    const snap = snapshotFeatures();
    expect(snap.marketingOperator.v1).toBe(false);
    expect(snap.marketingOperator.livePublishingV1).toBe(false);
  });

  it('seed pilot creates drafts only (no PUBLISHED)', async () => {
    const result = await seedPilotCampaign({ actorId: 'admin1' });
    expect(result.ok).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.statuses.every((s) => s === 'DRAFT' || s === 'READY_FOR_APPROVAL')).toBe(true);
    expect(result.statuses.includes('PUBLISHED')).toBe(false);
    expect(result.campaign.targetType).toBe('USER_ACQUISITION');
    expect(result.campaign.channel).toBe('facebook');
    expect(result.campaign.metadata?.targetType).toBe('USER_ACQUISITION');
  });

  it('meta provider without provider flag returns CONFIG_REQUIRED', async () => {
    process.env.ENABLE_FACEBOOK_MARKETING_PROVIDER_V1 = 'false';
    const provider = createMetaFacebookPageProvider();
    const result = await provider.publish({
      contentId: 'x',
      body: 'y',
      idempotencyKey: 'z',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('CONFIG_REQUIRED');
  });
});
