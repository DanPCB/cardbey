import { describe, it, expect, beforeEach } from 'vitest';
import { emitStoreActivity, clearStoreActivityEmitterForTests } from './storeActivityEmitter.js';
import {
  clearStoreActivityStoreForTests,
  listStoreActivityEvents,
  addStoreActivityStreamClient,
  getStoreActivityStreamClientCount,
} from './storeActivityStore.js';
import { sanitizeStoreActivityEvent } from './storeActivitySanitizer.js';
import { assertStoreActivityAccess } from './storeActivityAccess.js';
import { emitStoreActivityFromIntentSignal } from './storeActivityHooks.js';

describe('storeActivity', () => {
  beforeEach(() => {
    clearStoreActivityStoreForTests();
    clearStoreActivityEmitterForTests();
    process.env.STORE_ACTIVITY_ENABLED = 'true';
  });

  it('emit creates scoped event in store buffer', () => {
    const event = emitStoreActivity({
      storeId: 'store-a',
      type: 'offer_viewed',
      entityType: 'offer',
      entityId: 'offer-1',
    });
    expect(event).toBeTruthy();
    expect(event?.storeId).toBe('store-a');
    expect(event?.type).toBe('offer_viewed');
    expect(event?.actorId).toBeNull();

    const listed = listStoreActivityEvents('store-a', { limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(event?.id);
  });

  it('does not leak events across stores', () => {
    emitStoreActivity({ storeId: 'store-a', type: 'store_viewed' });
    emitStoreActivity({ storeId: 'store-b', type: 'offer_viewed', entityId: 'o1' });

    expect(listStoreActivityEvents('store-a')).toHaveLength(1);
    expect(listStoreActivityEvents('store-b')).toHaveLength(1);
    expect(listStoreActivityEvents('store-a')[0].type).toBe('store_viewed');
    expect(listStoreActivityEvents('store-b')[0].type).toBe('offer_viewed');
  });

  it('deduplicates repeated events within 30s window', () => {
    const base = {
      storeId: 'store-a',
      type: 'device_qr_scanned',
      entityType: 'store',
      entityId: 'store-a',
    };
    const first = emitStoreActivity(base);
    const second = emitStoreActivity(base);
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(listStoreActivityEvents('store-a')).toHaveLength(1);
  });

  it('stream delivers only to matching store clients', () => {
    /** @type {string[]} */
    const chunksA = [];
    /** @type {string[]} */
    const chunksB = [];
    const resA = {
      writableEnded: false,
      destroyed: false,
      write(chunk) {
        chunksA.push(String(chunk));
        return true;
      },
      on() {},
    };
    const resB = {
      writableEnded: false,
      destroyed: false,
      write(chunk) {
        chunksB.push(String(chunk));
        return true;
      },
      on() {},
    };

    addStoreActivityStreamClient('store-a', resA);
    addStoreActivityStreamClient('store-b', resB);
    expect(getStoreActivityStreamClientCount('store-a')).toBe(1);

    emitStoreActivity({ storeId: 'store-a', type: 'store_viewed' });
    expect(chunksA.some((c) => c.includes('store-activity'))).toBe(true);
    expect(chunksB.join('')).not.toContain('store_viewed');
  });

  it('strips personal data from API responses', () => {
    const event = emitStoreActivity({
      storeId: 'store-a',
      type: 'customer_inquiry',
      title: 'Inquiry',
      message: 'Contact user@example.com or +1 555-123-4567',
      metadata: { email: 'secret@example.com', customerName: 'Jane Doe', offerId: 'o1' },
    });
    const sanitized = sanitizeStoreActivityEvent(event);
    expect(sanitized.message).not.toContain('user@example.com');
    expect(sanitized.message).toContain('[email]');
    expect(sanitized.metadata.email).toBeUndefined();
    expect(sanitized.metadata.customerName).toBeUndefined();
    expect(sanitized.metadata.offerId).toBe('o1');
  });

  it('maps intent signals to store activity types', () => {
    const event = emitStoreActivityFromIntentSignal({
      storeId: 'store-a',
      type: 'qr_scan',
      offerId: null,
    });
    expect(event?.type).toBe('device_qr_scanned');
  });

  it('assertStoreActivityAccess returns 403 for non-owner', async () => {
    const prisma = (await import('../prisma.js')).default;
    const original = prisma.business.findUnique;
    prisma.business.findUnique = async () => ({ id: 'store-a', userId: 'owner-1' });

    const forbidden = await assertStoreActivityAccess(
      { userId: 'other-user', user: { id: 'other-user', role: 'owner' } },
      'store-a',
    );
    expect(forbidden.ok).toBe(false);
    expect(forbidden.status).toBe(403);

    prisma.business.findUnique = original;
  });
});
