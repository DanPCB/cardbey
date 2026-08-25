import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  ingestWebhookEvent,
  isWebhookVerificationConfigured,
  WEBHOOK_VERIFICATION_NOT_CONFIGURED,
} from '../webhookMeta.js';
import { metaMarketingWebhookPost } from '../../../routes/webhooks/metaMarketingWebhookRoutes.js';

vi.mock('../repository.js', () => {
  const store = { events: [] };
  return {
    marketingRepo: {
      webhookEvent: {
        findFirst: async () => null,
        create: async (data) => {
          const row = { id: `wh_${store.events.length + 1}`, ...data };
          store.events.push(row);
          return row;
        },
        update: async ({ where, data }) => {
          const row = store.events.find((e) => e.id === where.id);
          Object.assign(row, data);
          return row;
        },
      },
    },
  };
});

vi.mock('../engagementService.js', () => ({
  ingestEngagementFromWebhook: vi.fn(async () => {
    throw new Error('should_not_ingest');
  }),
}));

describe('marketingOperator/webhook fail-closed', () => {
  beforeEach(() => {
    delete process.env.META_WEBHOOK_APP_SECRET;
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    process.env.ENABLE_FACEBOOK_WEBHOOK_CONSUME_V1 = 'true';
    process.env.ENABLE_FACEBOOK_ENGAGEMENT_INBOX_V1 = 'true';
  });

  it('reports verification not configured when secrets missing', () => {
    expect(isWebhookVerificationConfigured()).toBe(false);
  });

  it('route refuses consume when secrets missing', async () => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    await metaMarketingWebhookPost({ body: Buffer.from('{}'), headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe(WEBHOOK_VERIFICATION_NOT_CONFIGURED);
    expect(res.body.processed).toBe(false);
  });

  it('ingest does not process when consume on but signatureVerified false', async () => {
    process.env.META_WEBHOOK_APP_SECRET = 'secret';
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'token';
    const raw = Buffer.from(JSON.stringify({ object: 'page', entry: [] }));
    const result = await ingestWebhookEvent(raw, null, { signatureVerified: false });
    expect(result.processed).toBe(false);
    expect(result.code).toBe(WEBHOOK_VERIFICATION_NOT_CONFIGURED);
  });

  it('does not map engagements when webhook consume is off', async () => {
    delete process.env.ENABLE_FACEBOOK_WEBHOOK_CONSUME_V1;
    process.env.META_WEBHOOK_APP_SECRET = 'secret';
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'token';
    const payload = {
      object: 'page',
      entry: [
        {
          id: 'page1',
          time: 99,
          changes: [
            { field: 'feed', value: { item: 'comment', comment_id: 'c1', message: 'hi' } },
          ],
        },
      ],
    };
    const result = await ingestWebhookEvent(Buffer.from(JSON.stringify(payload)), payload, {
      signatureVerified: true,
    });
    expect(result.processed).toBe(false);
    expect(result.reason).toBe('webhook_consume_disabled');
  });
});
