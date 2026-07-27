/**
 * Unit tests — public store lifecycle events.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PUBLIC_LIFECYCLE_EVENT_TYPES,
  emitPublicStoreLifecycleEvent,
  listPublicStoreLifecycleEvents,
  projectLifecycleRow,
  synthesizeLifecycleFromCreatedAt,
} from '../publicStoreLifecycleEvents.js';

describe('publicStoreLifecycleEvents', () => {
  it('projects just_launched within 7 days', () => {
    const now = Date.parse('2026-07-19T00:00:00.000Z');
    const row = {
      id: 'e1',
      eventType: PUBLIC_LIFECYCLE_EVENT_TYPES.LOYALTY_PROGRAM_PUBLISHED,
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
      metadataJson: { title: 'Coffee Club', entityId: 'loy-1', public: true },
    };
    const projected = projectLifecycleRow(row, now);
    expect(projected.freshness).toBe('just_launched');
    expect(projected.title).toBe('Coffee Club');
  });

  it('synthesizes from recent createdAt', () => {
    const now = Date.parse('2026-07-19T00:00:00.000Z');
    const events = synthesizeLifecycleFromCreatedAt(
      [
        {
          id: 'camp-1',
          title: 'Summer package',
          createdAt: '2026-07-18T00:00:00.000Z',
        },
      ],
      PUBLIC_LIFECYCLE_EVENT_TYPES.CAMPAIGN_LAUNCHED,
      now,
    );
    expect(events).toHaveLength(1);
    expect(events[0].freshness).toBe('just_launched');
  });

  it('emits and dedupes by entityId', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'evt-1' });
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'evt-1', metadataJson: { entityId: 'camp-1' } }]);
    const prisma = {
      storeActivityEvent: { create, findMany },
    };

    const first = await emitPublicStoreLifecycleEvent(prisma, {
      storeId: 'store-1',
      eventType: PUBLIC_LIFECYCLE_EVENT_TYPES.CAMPAIGN_LAUNCHED,
      title: 'Summer package',
      entityId: 'camp-1',
    });
    expect(first.ok).toBe(true);
    expect(first.deduped).toBeFalsy();
    expect(create).toHaveBeenCalledTimes(1);

    const second = await emitPublicStoreLifecycleEvent(prisma, {
      storeId: 'store-1',
      eventType: PUBLIC_LIFECYCLE_EVENT_TYPES.CAMPAIGN_LAUNCHED,
      title: 'Summer package',
      entityId: 'camp-1',
    });
    expect(second.deduped).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lists only public_lifecycle events', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'e1',
        eventType: PUBLIC_LIFECYCLE_EVENT_TYPES.PROMOTION_ACTIVATED,
        createdAt: new Date('2026-07-18'),
        metadataJson: { title: '10% off', entityId: 'p1' },
      },
    ]);
    const events = await listPublicStoreLifecycleEvents(
      { storeActivityEvent: { findMany } },
      'store-1',
    );
    expect(events[0].title).toBe('10% off');
    expect(findMany.mock.calls[0][0].where.source).toBe('public_lifecycle');
  });
});
