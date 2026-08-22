/**
 * Phase 1 — store Shows / featuredWorks lifecycle + public visibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listShowWorksFromSettings,
  normalizeShowStatus,
  isShowPubliclyVisible,
  buildRelevanceWarning,
  persistStoreShows,
  setStoreShowStatus,
  upsertStoreShow,
} from '../../src/services/storeShows/storeShowsService.js';

describe('storeShowsService', () => {
  it('treats legacy items without status as PUBLISHED', () => {
    expect(normalizeShowStatus(undefined)).toBe('PUBLISHED');
    expect(isShowPubliclyVisible({ status: null })).toBe(true);
    expect(isShowPubliclyVisible({ status: 'HIDDEN' })).toBe(false);
    expect(isShowPubliclyVisible({ status: 'DRAFT' })).toBe(false);
    expect(isShowPubliclyVisible({ status: 'ARCHIVED' })).toBe(false);
  });

  it('lists and sorts works deterministically', () => {
    const works = listShowWorksFromSettings({
      featuredWorks: [
        { id: 'b', title: 'B', imageUrl: 'https://x/b.jpg', sortOrder: 2 },
        { id: 'a', title: 'A', imageUrl: 'https://x/a.jpg', sortOrder: 1 },
      ],
    });
    expect(works.map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('flags flower-store mismatch titles deterministically', () => {
    const warn = buildRelevanceWarning(
      { title: 'Assessment', description: 'Basic Package' },
      { name: 'BB Flowers', type: 'florist', description: 'bouquets' },
    );
    expect(warn).toMatch(/may not match/i);
  });

  it('hide / archive / restore stay non-destructive', async () => {
    const store = {
      id: 'store_1',
      storefrontSettings: {
        featuredWorks: [
          {
            id: 'show_1',
            title: 'Assessment',
            imageUrl: 'https://cdn.example/a.jpg',
            status: 'PUBLISHED',
          },
          {
            id: 'show_2',
            title: 'Basic Package',
            imageUrl: 'https://cdn.example/b.jpg',
            status: 'PUBLISHED',
          },
        ],
      },
      stylePreferences: { miniWebsite: { sections: [] } },
    };
    const prisma = {
      business: {
        findUnique: vi.fn(async () => store),
        update: vi.fn(async ({ data }) => {
          store.storefrontSettings = data.storefrontSettings;
          store.stylePreferences = data.stylePreferences;
          return store;
        }),
      },
      auditEvent: { create: vi.fn(async () => ({})) },
    };

    await setStoreShowStatus(prisma, {
      storeId: 'store_1',
      workId: 'show_1',
      status: 'HIDDEN',
      actorId: 'owner_1',
    });
    let works = listShowWorksFromSettings(store.storefrontSettings);
    expect(works.find((w) => w.id === 'show_1')?.status).toBe('HIDDEN');
    expect(works.find((w) => w.id === 'show_2')?.status).toBe('PUBLISHED');

    await setStoreShowStatus(prisma, {
      storeId: 'store_1',
      workId: 'show_1',
      status: 'ARCHIVED',
      actorId: 'owner_1',
    });
    works = listShowWorksFromSettings(store.storefrontSettings);
    expect(works.find((w) => w.id === 'show_1')?.status).toBe('ARCHIVED');
    expect(works).toHaveLength(2);

    await setStoreShowStatus(prisma, {
      storeId: 'store_1',
      workId: 'show_1',
      status: 'HIDDEN',
      actorId: 'owner_1',
    });
    works = listShowWorksFromSettings(store.storefrontSettings);
    expect(works.find((w) => w.id === 'show_1')?.status).toBe('HIDDEN');
  });

  it('rejects missing media on create via upsert', async () => {
    const store = {
      id: 'store_1',
      storefrontSettings: { featuredWorks: [] },
      stylePreferences: {},
    };
    const prisma = {
      business: {
        findUnique: vi.fn(async () => store),
        update: vi.fn(),
      },
      auditEvent: { create: vi.fn() },
    };
    await expect(
      upsertStoreShow(prisma, {
        storeId: 'store_1',
        workId: null,
        patch: { title: 'No Media' },
        actorId: 'owner_1',
      }),
    ).rejects.toMatchObject({ code: 'invalid_show' });
  });

  it('persistStoreShows writes featuredWorks only (same Business)', async () => {
    const store = {
      id: 'store_1',
      storefrontSettings: { featuredWorks: [] },
      stylePreferences: {},
    };
    const prisma = {
      business: {
        findUnique: vi.fn(async () => store),
        update: vi.fn(async ({ data }) => {
          Object.assign(store, data);
          return store;
        }),
      },
      auditEvent: { create: vi.fn(async () => ({})) },
    };
    await persistStoreShows(prisma, {
      storeId: 'store_1',
      works: [
        {
          id: 'x',
          title: 'Show',
          thumbnailUrl: 'https://cdn.example/x.jpg',
          status: 'DRAFT',
        },
      ],
      actorId: 'owner_1',
    });
    expect(prisma.business.update).toHaveBeenCalledTimes(1);
    const saved = listShowWorksFromSettings(store.storefrontSettings);
    expect(saved[0].status).toBe('DRAFT');
    expect(isShowPubliclyVisible(saved[0])).toBe(false);
  });
});
