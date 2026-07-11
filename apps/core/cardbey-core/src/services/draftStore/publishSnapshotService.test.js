import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildPublishSnapshotFromPreview,
  verifyPublishIdentity,
  snapshotToPreviewShape,
  PublishSnapshotError,
  ensurePublishSnapshot,
} from './publishSnapshotService.js';

describe('publishSnapshotService', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds snapshot from preview with catalog items', () => {
    const draft = {
      id: 'draft-1',
      generationRunId: 'gen-1',
      ownerUserId: 'user-1',
      input: { businessName: 'Test Cafe' },
      preview: {
        items: [{ name: 'Latte', price: 5 }],
        categories: [{ id: 'c1', name: 'Drinks' }],
        meta: { storeName: 'Test Cafe' },
      },
    };
    const snap = buildPublishSnapshotFromPreview(draft, draft.preview, 1);
    expect(snap.draftId).toBe('draft-1');
    expect(snap.generationRunId).toBe('gen-1');
    expect(snap.catalog.products).toHaveLength(1);
    expect(snap.sourceFingerprint).toBeTruthy();
    expect(snap.version).toBe(1);
  });

  it('verifyPublishIdentity throws on draftId mismatch', () => {
    const snap = buildPublishSnapshotFromPreview(
      { id: 'a', input: {}, preview: { items: [{ name: 'X', price: 1 }] } },
      { items: [{ name: 'X', price: 1 }] },
      1,
    );
    expect(() =>
      verifyPublishIdentity(snap, {
        expectedDraftId: 'b',
        expectedSnapshotVersion: 1,
        expectedSourceFingerprint: snap.sourceFingerprint,
      }),
    ).toThrow(PublishSnapshotError);
  });

  it('ensurePublishSnapshot rebuilds snapshot when preview fingerprint drifted', async () => {
    const prev = process.env.PUBLISH_SNAPSHOT_V1;
    process.env.PUBLISH_SNAPSHOT_V1 = 'true';
    const oldItems = [{ name: 'Old Burger', price: 10, category: 'Food' }];
    const newItems = [{ name: 'New Salad', price: 8, category: 'Food' }];
    const staleSnap = buildPublishSnapshotFromPreview(
      { id: 'draft-1', input: {}, preview: { items: oldItems } },
      { items: oldItems },
      1,
    );
    const prisma = {
      draftStore: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'draft-1',
          input: {},
          preview: { items: newItems, categories: [] },
          publishSnapshot: staleSnap,
          publishSnapshotVersion: 1,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const { snapshot, reconciled } = await ensurePublishSnapshot(prisma, 'draft-1');
    expect(reconciled).toBe(true);
    expect(snapshot.catalog.products.map((p) => p.name)).toEqual(['New Salad']);
    expect(prisma.draftStore.update).toHaveBeenCalled();
    if (prev === undefined) delete process.env.PUBLISH_SNAPSHOT_V1;
    else process.env.PUBLISH_SNAPSHOT_V1 = prev;
  });

  it('snapshotToPreviewShape mirrors catalog into items', () => {
    const snap = buildPublishSnapshotFromPreview(
      { id: 'd1', input: {}, preview: { items: [{ name: 'Tea', price: 3 }] } },
      { items: [{ name: 'Tea', price: 3 }] },
      2,
    );
    const preview = snapshotToPreviewShape(snap);
    expect(preview.items).toHaveLength(1);
    expect(preview.catalog.products).toHaveLength(1);
  });

  it('buildPublishSnapshotFromPreview canonicalizes video hero (video wins)', () => {
    const draft = {
      id: 'draft-hero',
      input: {},
      preview: {
        heroMediaType: 'video',
        heroVideoUrl: 'https://cdn.example.com/hero.mp4',
        // legacy image should only become poster (must not override video)
        hero: { imageUrl: 'https://cdn.example.com/poster.jpg' },
        items: [{ name: 'Tea', price: 3 }],
      },
    };
    const snap = buildPublishSnapshotFromPreview(draft, draft.preview, 1);
    expect(snap.hero).toMatchObject({
      type: 'video',
      url: 'https://cdn.example.com/hero.mp4',
      videoUrl: 'https://cdn.example.com/hero.mp4',
      imageUrl: 'https://cdn.example.com/poster.jpg',
    });
  });

  it('snapshotToPreviewShape keeps heroVideoUrl + poster in preview', () => {
    const snap = {
      draftId: 'd1',
      name: 'X',
      catalog: { products: [], categories: [] },
      meta: {},
      hero: {
        type: 'video',
        url: 'https://cdn.example.com/hero.mp4',
        videoUrl: 'https://cdn.example.com/hero.mp4',
        imageUrl: 'https://cdn.example.com/poster.jpg',
      },
    };
    const preview = snapshotToPreviewShape(snap);
    expect(preview.heroMediaType).toBe('video');
    expect(preview.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(preview.heroImageUrl).toBe('https://cdn.example.com/poster.jpg');
    expect(preview.heroPosterUrl).toBe('https://cdn.example.com/poster.jpg');
  });

  it('snapshotToPreviewShape rehydrate keeps video when hero has videoUrl', () => {
    const snap = {
      draftId: 'd1',
      name: 'X',
      catalog: { products: [], categories: [] },
      meta: {},
      hero: {
        videoUrl: 'https://cdn.example.com/user-hero.mp4',
        imageUrl: 'https://cdn.example.com/stale-still.jpg',
      },
    };
    const preview = snapshotToPreviewShape(snap);
    expect(preview.heroMediaType).toBe('video');
    expect(preview.heroVideoUrl).toBe('https://cdn.example.com/user-hero.mp4');
    expect(preview.hero?.videoUrl).toBe('https://cdn.example.com/user-hero.mp4');
    expect(preview.heroImageUrl).toBe('https://cdn.example.com/stale-still.jpg');
  });

  it('snapshotToPreviewShape does not promote stale hero.imageUrl over video', () => {
    const snap = {
      draftId: 'd1',
      name: 'X',
      catalog: { products: [], categories: [] },
      meta: {},
      hero: {
        type: 'video',
        videoUrl: 'https://cdn.example.com/user-hero.mp4',
        url: 'https://cdn.example.com/user-hero.mp4',
        imageUrl: 'https://cdn.example.com/stale-only-image.jpg',
      },
    };
    const preview = snapshotToPreviewShape(snap);
    expect(preview.heroMediaType).toBe('video');
    expect(preview.heroVideoUrl).toBe('https://cdn.example.com/user-hero.mp4');
    expect(preview.hero?.url).toBe('https://cdn.example.com/user-hero.mp4');
    expect(preview.heroImageUrl).toBe('https://cdn.example.com/stale-only-image.jpg');
  });

  it('ensurePublishSnapshot does not reconcile twice after category normalization drift', async () => {
    const prev = process.env.PUBLISH_SNAPSHOT_V1;
    process.env.PUBLISH_SNAPSHOT_V1 = 'true';
    const items = [
      { name: 'Manicure', price: 40, categoryId: 'missing-cat' },
      { name: 'Pedicure', price: 35, categoryId: 'missing-cat' },
    ];
    const normalizedPreview = { items: items.map((item) => ({ ...item })), categories: [] };
    const { normalizePreviewCategories } = await import('./draftStoreService.js');
    normalizePreviewCategories(normalizedPreview);
    const storedSnap = buildPublishSnapshotFromPreview(
      { id: 'draft-cat', input: {}, preview: normalizedPreview },
      normalizedPreview,
      3,
    );
    const prisma = {
      draftStore: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'draft-cat',
          input: {},
          preview: { items, categories: [] },
          publishSnapshot: storedSnap,
          publishSnapshotVersion: 3,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const first = await ensurePublishSnapshot(prisma, 'draft-cat');
    expect(first.reconciled).toBeUndefined();
    expect(first.version).toBe(3);
    const second = await ensurePublishSnapshot(prisma, 'draft-cat');
    expect(second.reconciled).toBeUndefined();
    expect(second.version).toBe(3);
    expect(prisma.draftStore.update).not.toHaveBeenCalled();
    if (prev === undefined) delete process.env.PUBLISH_SNAPSHOT_V1;
    else process.env.PUBLISH_SNAPSHOT_V1 = prev;
  });

  it('ensurePublishSnapshot rebuilds snapshot when only hero changed (catalog fingerprint unchanged)', async () => {
    const prev = process.env.PUBLISH_SNAPSHOT_V1;
    process.env.PUBLISH_SNAPSHOT_V1 = 'true';
    const items = [{ name: 'Tea', price: 3 }];
    const staleSnap = buildPublishSnapshotFromPreview(
      { id: 'draft-hero-drift', input: {}, preview: { items } },
      { items, heroMediaType: 'image', heroImageUrl: 'https://cdn.example.com/old.jpg' },
      1,
    );
    const prisma = {
      draftStore: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'draft-hero-drift',
          input: {},
          preview: {
            items,
            heroMediaType: 'video',
            heroVideoUrl: 'https://cdn.example.com/hero.mp4',
          },
          publishSnapshot: staleSnap,
          publishSnapshotVersion: 1,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const { snapshot, reconciled } = await ensurePublishSnapshot(prisma, 'draft-hero-drift');
    expect(reconciled).toBe(true);
    expect(snapshot.hero?.videoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(snapshot.hero?.type).toBe('video');
    expect(prisma.draftStore.update).toHaveBeenCalled();
    if (prev === undefined) delete process.env.PUBLISH_SNAPSHOT_V1;
    else process.env.PUBLISH_SNAPSHOT_V1 = prev;
  });

  it('snapshotToPreviewShape rehydrates image-only snapshot', () => {
    const snap = {
      draftId: 'd1',
      name: 'X',
      catalog: { products: [], categories: [] },
      meta: {},
      hero: {
        type: 'image',
        imageUrl: 'https://cdn.example.com/hero.jpg',
        url: 'https://cdn.example.com/hero.jpg',
      },
    };
    const preview = snapshotToPreviewShape(snap);
    expect(preview.heroMediaType).toBe('image');
    expect(preview.heroImageUrl).toBe('https://cdn.example.com/hero.jpg');
    expect(preview.heroVideoUrl).toBeNull();
  });
});
