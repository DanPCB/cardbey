import { describe, expect, it, beforeEach } from 'vitest';
import {
  createSuitcaseItem,
  listSuitcaseItems,
  getSuitcaseItem,
  updateSuitcaseItem,
  deleteSuitcaseItem,
  saveBusinessBriefingSuitcaseItem,
  buildBriefingIdempotencyKey,
} from './suitcaseItemService.js';
import { mirrorMissionOutputToSuitcase } from './suitcaseMissionOutputBridge.js';
import { saveUploadToSuitcase } from './suitcaseUploadBridge.js';

function makePrisma() {
  const items = new Map();
  let seq = 0;

  const prisma = {
    suitcaseItem: {
      findUnique: async ({ where }) => {
        if (where.id) return items.get(where.id) ?? null;
        if (where.idempotencyKey) {
          return [...items.values()].find((r) => r.idempotencyKey === where.idempotencyKey) ?? null;
        }
        return null;
      },
      findFirst: async ({ where }) => {
        return [...items.values()].find((r) => {
          if (where.id && r.id !== where.id) return false;
          if (where.ownerId && r.ownerId !== where.ownerId) return false;
          return true;
        }) ?? null;
      },
      findMany: async ({ where, orderBy, take, cursor, skip }) => {
        let rows = [...items.values()].filter((r) => {
          if (where.ownerId && r.ownerId !== where.ownerId) return false;
          if (where.storeId && r.storeId !== where.storeId) return false;
          if (where.spaceId && r.spaceId !== where.spaceId) return false;
          if (where.sourceType && r.sourceType !== where.sourceType) return false;
          if (where.contentType && r.contentType !== where.contentType) return false;
          if (where.missionId && r.missionId !== where.missionId) return false;
          return true;
        });
        rows.sort((a, b) => {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
          if (tb !== ta) return tb - ta;
          return String(b.id).localeCompare(String(a.id));
        });
        if (cursor?.id && skip) {
          const idx = rows.findIndex((r) => r.id === cursor.id);
          if (idx >= 0) rows = rows.slice(idx + 1);
        }
        if (take) rows = rows.slice(0, take);
        return rows;
      },
      create: async ({ data }) => {
        const row = {
          ...data,
          id: data.id ?? `item-${++seq}`,
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date(),
        };
        items.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const existing = items.get(where.id);
        if (!existing) throw new Error('not found');
        const row = { ...existing, ...data, updatedAt: new Date() };
        items.set(where.id, row);
        return row;
      },
      delete: async ({ where }) => {
        items.delete(where.id);
      },
    },
  };

  return { prisma, items };
}

describe('suitcaseItemService', () => {
  let prisma;
  let items;

  beforeEach(() => {
    ({ prisma, items } = makePrisma());
  });

  it('creates suitcase item', async () => {
    const result = await createSuitcaseItem(
      {
        ownerId: 'owner-1',
        storeId: 'store-1',
        sourceType: 'artifact',
        contentType: 'json',
        title: 'Test artifact',
        payload: { foo: 'bar' },
      },
      prisma,
    );
    expect(result.item?.title).toBe('Test artifact');
    expect(result.created).toBe(true);
    expect(items.size).toBe(1);
  });

  it('lists by owner', async () => {
    await createSuitcaseItem(
      { ownerId: 'owner-1', sourceType: 'artifact', contentType: 'json', title: 'A' },
      prisma,
    );
    await createSuitcaseItem(
      { ownerId: 'owner-2', sourceType: 'artifact', contentType: 'json', title: 'B' },
      prisma,
    );
    const list = await listSuitcaseItems({ ownerId: 'owner-1' }, prisma);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].title).toBe('A');
  });

  it('blocks cross-owner read', async () => {
    const created = await createSuitcaseItem(
      { ownerId: 'owner-1', sourceType: 'artifact', contentType: 'json', title: 'Secret' },
      prisma,
    );
    await expect(
      getSuitcaseItem({ ownerId: 'owner-2', itemId: created.item.id }, prisma),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('filters by storeId and sourceType', async () => {
    await createSuitcaseItem(
      {
        ownerId: 'owner-1',
        storeId: 'store-a',
        sourceType: 'business_briefing',
        contentType: 'json',
        title: 'Briefing A',
      },
      prisma,
    );
    await createSuitcaseItem(
      {
        ownerId: 'owner-1',
        storeId: 'store-b',
        sourceType: 'upload',
        contentType: 'pdf',
        title: 'Upload B',
      },
      prisma,
    );
    const filtered = await listSuitcaseItems(
      { ownerId: 'owner-1', storeId: 'store-a', sourceType: 'business_briefing' },
      prisma,
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].title).toBe('Briefing A');
  });

  it('upserts suitcase item when idempotency key matches and payload is provided', async () => {
    const first = await createSuitcaseItem(
      {
        ownerId: 'owner-1',
        storeId: 'store-1',
        sourceType: 'artifact',
        contentType: 'json',
        title: 'Loyalty v1',
        payload: { version: 1 },
        idempotencyKey: 'loyalty-gen:owner-1:store-1',
        refreshOnIdempotency: true,
      },
      prisma,
    );
    const second = await createSuitcaseItem(
      {
        ownerId: 'owner-1',
        storeId: 'store-1',
        sourceType: 'artifact',
        contentType: 'json',
        title: 'Loyalty v2',
        payload: { version: 2 },
        idempotencyKey: 'loyalty-gen:owner-1:store-1',
        refreshOnIdempotency: true,
      },
      prisma,
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.updated).toBe(true);
    expect(items.size).toBe(1);
    expect(second.item.title).toBe('Loyalty v2');
    expect(second.item.payload?.version).toBe(2);
  });

  it('saves briefing idempotently', async () => {
    const briefing = {
      greeting: 'Good morning',
      storeName: 'Cafe',
      healthScore: 72,
      todaySummary: ['Sales up'],
      needsAttention: [],
      recentExperience: [],
      ownerContext: [],
      suggestedActions: [],
    };
    const first = await saveBusinessBriefingSuitcaseItem(
      {
        ownerId: 'owner-1',
        storeId: 'store-1',
        snapshotId: 'store-1:2026-06-07',
        storeName: 'Cafe',
        briefing,
      },
      prisma,
    );
    const second = await saveBusinessBriefingSuitcaseItem(
      {
        ownerId: 'owner-1',
        storeId: 'store-1',
        snapshotId: 'store-1:2026-06-07',
        storeName: 'Cafe',
        briefing,
      },
      prisma,
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(items.size).toBe(1);
    expect(buildBriefingIdempotencyKey('owner-1', 'store-1', 'store-1:2026-06-07')).toContain('briefing:');
  });

  it('deletes item for owner', async () => {
    const created = await createSuitcaseItem(
      { ownerId: 'owner-1', sourceType: 'document', contentType: 'text', title: 'Doc' },
      prisma,
    );
    await deleteSuitcaseItem({ ownerId: 'owner-1', itemId: created.item.id }, prisma);
    expect(items.size).toBe(0);
  });

  it('blocks cross-owner delete', async () => {
    const created = await createSuitcaseItem(
      { ownerId: 'owner-1', sourceType: 'document', contentType: 'text', title: 'Doc' },
      prisma,
    );
    await expect(
      deleteSuitcaseItem({ ownerId: 'owner-2', itemId: created.item.id }, prisma),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updates item patch', async () => {
    const created = await createSuitcaseItem(
      { ownerId: 'owner-1', sourceType: 'document', contentType: 'text', title: 'Doc' },
      prisma,
    );
    const updated = await updateSuitcaseItem(
      { ownerId: 'owner-1', itemId: created.item.id, patch: { summary: 'Updated summary' } },
      prisma,
    );
    expect(updated.item.summary).toBe('Updated summary');
  });
});

describe('suitcaseMissionOutputBridge', () => {
  let prisma;

  beforeEach(() => {
    ({ prisma } = makePrisma());
  });

  it('saves mission offer draft output', async () => {
    const result = await mirrorMissionOutputToSuitcase(
      {
        ownerId: 'owner-1',
        storeId: 'store-1',
        missionId: 'mission-1',
        missionOutputs: { offer: { title: 'Summer Sale', description: '20% off' } },
        missionStatus: 'completed',
        actionType: 'create_offer',
      },
      prisma,
    );
    expect(result.item?.sourceType).toBe('offer_draft');
    expect(result.item?.title).toContain('Summer Sale');
  });

  it('skips when suitcaseItemId already set', async () => {
    const result = await mirrorMissionOutputToSuitcase(
      {
        ownerId: 'owner-1',
        missionId: 'mission-2',
        missionOutputs: { suitcaseItemId: 'existing-item' },
      },
      prisma,
    );
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_linked');
  });
});

describe('suitcaseUploadBridge', () => {
  let prisma;

  beforeEach(() => {
    ({ prisma } = makePrisma());
  });

  it('saves upload to suitcase', async () => {
    const result = await saveUploadToSuitcase(
      {
        ownerId: 'owner-1',
        storeId: 'store-1',
        fileUrl: 'https://cdn.example/menu.pdf',
        originalFilename: 'menu.pdf',
        mimeType: 'application/pdf',
      },
      prisma,
    );
    expect(result.item?.sourceType).toBe('upload');
    expect(result.item?.contentType).toBe('pdf');
  });
});
