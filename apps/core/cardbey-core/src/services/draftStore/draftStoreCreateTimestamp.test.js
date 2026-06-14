import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { createDraftStoreForUser } from './draftStoreService.js';

describe('draftStore create timestamp regression', () => {
  let draftId;

  afterAll(async () => {
    if (draftId) {
      await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    }
  });

  it('DraftStore schema has no TIMESTAMP(3) columns on test SQLite DB', async () => {
    const cols = await prisma.$queryRawUnsafe('PRAGMA table_info("DraftStore")');
    const bad = cols.filter((col) => /TIMESTAMP/i.test(String(col.type ?? '')));
    expect(bad).toEqual([]);
  });

  it('createDraftStoreForUser succeeds without TIMESTAMP(3) conversion error', async () => {
    const draft = await createDraftStoreForUser(prisma, {
      userId: null,
      input: { prompt: 'Timestamp regression cafe' },
      mode: 'template',
      status: 'draft',
    });

    draftId = draft.id;
    expect(draft.id).toBeTruthy();
    expect(draft.createdAt).toBeInstanceOf(Date);
    expect(draft.updatedAt).toBeInstanceOf(Date);
    expect(draft.expiresAt).toBeInstanceOf(Date);
    expect(Number.isNaN(draft.createdAt.getTime())).toBe(false);
    expect(Number.isNaN(draft.updatedAt.getTime())).toBe(false);
    expect(Number.isNaN(draft.expiresAt.getTime())).toBe(false);
  });
});
