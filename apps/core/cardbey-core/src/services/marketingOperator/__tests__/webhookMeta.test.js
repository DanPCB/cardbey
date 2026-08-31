import { describe, expect, it, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { verifySignature, verifyChallenge, ingestWebhookEvent } from '../webhookMeta.js';

vi.mock('../repository.js', () => {
  const store = { events: [] };
  return {
    marketingRepo: {
      webhookEvent: {
        findFirst: async ({ where }) => {
          const eventId = where?.OR?.[0]?.eventId;
          const hash = where?.OR?.[1]?.payloadHash;
          return (
            store.events.find(
              (e) => e.eventId === eventId || e.payloadHash === hash,
            ) || null
          );
        },
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
      engagement: {
        findFirst: async () => null,
        create: async (data) => ({ id: 'eng1', ...data }),
      },
    },
  };
});

describe('marketingOperator/webhookMeta', () => {
  beforeEach(() => {
    process.env.META_WEBHOOK_APP_SECRET = 'test_secret';
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify_me';
    delete process.env.ENABLE_FACEBOOK_WEBHOOK_CONSUME_V1;
  });

  it('rejects invalid signature', () => {
    const body = Buffer.from('{"object":"page"}');
    const result = verifySignature(body, 'sha256=deadbeef');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('signature_mismatch');
  });

  it('accepts valid HMAC signature', () => {
    const body = Buffer.from('{"object":"page"}');
    const digest = crypto
      .createHmac('sha256', 'test_secret')
      .update(body)
      .digest('hex');
    const result = verifySignature(body, `sha256=${digest}`);
    expect(result.ok).toBe(true);
  });

  it('verifies challenge token', () => {
    const ok = verifyChallenge({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'verify_me',
      'hub.challenge': '12345',
    });
    expect(ok).toEqual({ ok: true, challenge: '12345' });
    const bad = verifyChallenge({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': '1',
    });
    expect(bad.ok).toBe(false);
  });

  it('handles duplicate webhook ingest', async () => {
    const payload = {
      object: 'page',
      entry: [{ id: 'page1', time: 100, changes: [] }],
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const first = await ingestWebhookEvent(raw, payload);
    const second = await ingestWebhookEvent(raw, payload);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });
});
