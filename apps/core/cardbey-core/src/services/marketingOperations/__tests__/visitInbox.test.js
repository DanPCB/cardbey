import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const store = {
  conversions: [],
  touches: [],
  campaigns: [],
  engagements: [],
};

vi.mock('../../marketingOperator/repository.js', () => ({
  marketingRepo: {
    campaign: {
      findFirst: async ({ where } = {}) => {
        const or = where?.OR;
        if (or) {
          return (
            store.campaigns.find((c) => or.some((q) => c.id === q.id || c.name === q.name)) || null
          );
        }
        return store.campaigns[0] || null;
      },
    },
    conversion: {
      create: async (data) => {
        const row = {
          id: `cv_${store.conversions.length + 1}`,
          occurredAt: data.occurredAt || new Date(),
          ...data,
        };
        store.conversions.push(row);
        return row;
      },
      findFirst: async ({ where } = {}) => {
        if (where?.dedupeKey) {
          return store.conversions.find((c) => c.dedupeKey === where.dedupeKey) || null;
        }
        const types = where?.eventType?.in || (where?.eventType ? [where.eventType] : null);
        const lt = where?.occurredAt?.lt;
        return (
          store.conversions.find((c) => {
            if (types && !types.includes(c.eventType)) return false;
            if (lt && !(new Date(c.occurredAt) < new Date(lt))) return false;
            const or = where?.OR;
            if (or) {
              return or.some(
                (q) =>
                  (q.visitorKey && c.visitorKey === q.visitorKey) ||
                  (q.anonymousId && c.anonymousId === q.anonymousId),
              );
            }
            return true;
          }) || null
        );
      },
      findMany: async () => store.conversions,
    },
    attributionTouch: {
      create: async (data) => {
        const row = { id: `t_${store.touches.length + 1}`, ...data };
        store.touches.push(row);
        return row;
      },
    },
    engagement: {
      create: async (data) => {
        const row = { id: `e_${store.engagements.length + 1}`, createdAt: new Date(), ...data };
        store.engagements.push(row);
        return row;
      },
      findFirst: async ({ where } = {}) =>
        store.engagements.find(
          (e) =>
            (!where?.provider || e.provider === where.provider) &&
            (!where?.externalId || e.externalId === where.externalId),
        ) || null,
      findUnique: async ({ where }) => store.engagements.find((e) => e.id === where.id) || null,
      findMany: async ({ where } = {}) => {
        return store.engagements.filter((e) => {
          if (where?.campaignId && e.campaignId !== where.campaignId) return false;
          if (where?.provider && e.provider !== where.provider) return false;
          if (where?.status?.in && !where.status.in.includes(e.status)) return false;
          return true;
        });
      },
      update: async ({ where, data }) => {
        const row = store.engagements.find((e) => e.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
  },
  MarketingRepoError: class MarketingRepoError extends Error {},
}));

vi.mock('../../marketingOperator/audit.js', () => ({
  appendMarketingAudit: async () => {},
}));

import { Features } from '../../../config/features.js';
import {
  CANONICAL_EVENTS,
  injectTestInteraction,
  listInboxInteractions,
  persistInboxInteraction,
  TARGET_TYPES,
  tryRecordSignup,
  updateInboxStatus,
} from '../index.js';
import { ingestFirstPartyVisit } from '../visitCapture.js';
import { normalizeFacebookWebhookInteractions } from '../../marketingOperator/webhookMeta.js';

describe('marketingOperations visit + inbox', () => {
  beforeEach(() => {
    store.conversions = [];
    store.touches = [];
    store.campaigns = [];
    store.engagements = [];
    process.env.ENABLE_MARKETING_OPERATOR_V1 = 'true';
    process.env.ENABLE_MARKETING_ATTRIBUTION_V1 = 'true';
    process.env.ENABLE_FACEBOOK_LIVE_PUBLISHING_V1 = 'false';
    process.env.ENABLE_FACEBOOK_WEBHOOK_CONSUME_V1 = 'false';
    process.env.ENABLE_FACEBOOK_RESPONSE_SENDING_V1 = 'false';
  });

  it('records attributed first visit', async () => {
    const res = await ingestFirstPartyVisit({
      body: {
        campaignId: 'camp1',
        utmSource: 'facebook',
        channel: 'facebook',
        anonymousId: 'anon_1',
        path: '/global-live',
        cb_attr: '1',
      },
      query: {},
      headers: {},
    });
    expect(res.visit.ok).toBe(true);
    expect(res.visit.eventType).toBe(CANONICAL_EVENTS.CARDBEY_VISIT);
    expect(store.conversions[0].anonymousId).toBe('anon_1');
    expect(store.conversions[0].metadata.path).toBe('/global-live');
  });

  it('skips unattributed visit', async () => {
    const res = await ingestFirstPartyVisit({
      body: { path: '/', anonymousId: 'anon_x' },
      query: {},
      headers: {},
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no_attribution_context');
    expect(store.conversions).toHaveLength(0);
  });

  it('dedupes refresh-loop visits in the same window', async () => {
    const req = {
      body: {
        campaignId: 'camp1',
        utmSource: 'facebook',
        anonymousId: 'anon_1',
        path: '/signup',
      },
      query: {},
      headers: {},
    };
    const first = await ingestFirstPartyVisit(req);
    const second = await ingestFirstPartyVisit(req);
    expect(first.visit.ok).toBe(true);
    expect(second.visit.deduped).toBe(true);
    expect(store.conversions.filter((c) => c.eventType === CANONICAL_EVENTS.CARDBEY_VISIT)).toHaveLength(
      1,
    );
  });

  it('continues attribution into signup', async () => {
    await ingestFirstPartyVisit({
      body: { campaignId: 'camp1', utmSource: 'facebook', anonymousId: 'anon_1', path: '/signup' },
      query: {},
      headers: {},
    });
    const signup = await tryRecordSignup(
      {
        body: {
          marketingAttribution: {
            campaignId: 'camp1',
            utmSource: 'facebook',
            anonymousId: 'anon_1',
          },
        },
      },
      { id: 'user_9' },
    );
    expect(signup.ok).toBe(true);
    expect(signup.eventType).toBe(CANONICAL_EVENTS.SIGNUP);
    expect(store.conversions.some((c) => c.eventType === CANONICAL_EVENTS.SIGNUP)).toBe(true);
  });

  it('emits USER_RETURNED only after a prior attributed visit older than 24h', async () => {
    store.conversions.push({
      id: 'old',
      eventType: CANONICAL_EVENTS.CARDBEY_VISIT,
      visitorKey: 'anon_r',
      anonymousId: 'anon_r',
      campaignId: 'camp1',
      occurredAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    const res = await ingestFirstPartyVisit({
      body: {
        campaignId: 'camp1',
        utmSource: 'facebook',
        anonymousId: 'anon_r',
        path: '/signup',
      },
      query: {},
      headers: {},
    });
    expect(res.visit.ok).toBe(true);
    expect(res.returned.ok).toBe(true);
    expect(res.returned.eventType).toBe(CANONICAL_EVENTS.USER_RETURNED);
  });

  it('allows investor visits but not SME lifecycle events', async () => {
    store.campaigns.push({ id: 'camp_inv', targetType: TARGET_TYPES.INVESTOR_DISCOVERY });
    const visit = await ingestFirstPartyVisit({
      body: {
        campaignId: 'camp_inv',
        utmSource: 'facebook',
        anonymousId: 'inv_1',
        path: '/',
        targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      },
      query: {},
      headers: {},
    });
    expect(visit.visit.ok).toBe(true);
    expect(visit.visit.targetType).toBe(TARGET_TYPES.INVESTOR_DISCOVERY);

    const { recordCanonicalEvent } = await import('../index.js');
    const sme = await recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.BUSINESS_CREATED,
      campaignId: 'camp_inv',
      storeId: 's1',
    });
    expect(sme.skipped).toBe(true);
    expect(sme.reason).toBe('investor_sme_lifecycle_blocked');
  });

  it('normalizes facebook comments and ignores DMs/ads', () => {
    const { supported, ignored } = normalizeFacebookWebhookInteractions({
      object: 'page',
      entry: [
        {
          id: 'page1',
          messaging: [{ sender: { id: 'psid' }, message: { text: 'hi' } }],
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                comment_id: 'c_1',
                post_id: 'p_1',
                message: 'How do I start?',
                from: { id: 'fb_user', name: 'A' },
              },
            },
            { field: 'ads', value: { ad_id: 'ad1' } },
          ],
        },
      ],
    });
    expect(supported).toHaveLength(1);
    expect(supported[0].interactionType).toBe('comment');
    expect(ignored.some((i) => i.reason === 'messaging_ignored')).toBe(true);
    expect(ignored.some((i) => i.reason === 'ads_ignored')).toBe(true);
  });

  it('dedupes inbox rows by provider + external id', async () => {
    const first = await persistInboxInteraction({
      provider: 'facebook',
      externalId: 'c_dup',
      body: 'one',
      ingestionSource: 'TEST',
    });
    const second = await persistInboxInteraction({
      provider: 'facebook',
      externalId: 'c_dup',
      body: 'two',
      ingestionSource: 'TEST',
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(store.engagements).toHaveLength(1);
  });

  it('injects TEST interactions and supports review/dismiss', async () => {
    const injected = await injectTestInteraction({
      campaignId: 'camp1',
      body: 'Test comment',
      interactionType: 'comment',
    });
    expect(injected.ok).toBe(true);
    expect(injected.interaction.ingestionSource).toBe('TEST');
    expect(injected.interaction.status).toBe('NEW');

    const reviewed = await updateInboxStatus(injected.engagement.id, 'REVIEWED', { actorId: 'admin' });
    expect(reviewed.ok).toBe(true);
    expect(reviewed.interaction.status).toBe('REVIEWED');

    const dismissed = await updateInboxStatus(injected.engagement.id, 'DISMISSED', {
      actorId: 'admin',
    });
    expect(dismissed.ok).toBe(true);
    expect(dismissed.interaction.status).toBe('DISMISSED');

    const listed = await listInboxInteractions({ status: 'DISMISSED' });
    expect(listed.interactions).toHaveLength(1);
    expect(Features.marketingOperator.livePublishingV1).toBe(false);
  });

  it('keeps test inject behind admin auth and public visit unauthenticated', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const adminSrc = readFileSync(
      path.resolve(here, '../../../routes/admin/marketingOperationsRoutes.js'),
      'utf8',
    );
    const publicSrc = readFileSync(
      path.resolve(here, '../../../routes/public/marketingVisitRoutes.js'),
      'utf8',
    );
    expect(adminSrc).toMatch(/router\.use\(requireAuth\)/);
    expect(adminSrc).toMatch(/router\.use\(requireAdmin\)/);
    expect(adminSrc).toContain('/marketing/inbox/test-inject');
    expect(publicSrc).not.toMatch('requireAuth');
    expect(publicSrc).toContain('/visits');
  });
});
