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
});
