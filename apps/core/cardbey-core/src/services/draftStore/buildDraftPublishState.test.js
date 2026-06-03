import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { buildDraftPublishState } from './buildDraftPublishState.js';

describe('buildDraftPublishState', () => {
  let userId;
  let businessId;
  let draftId;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `pub-state-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Pub State',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: {
        userId,
        slug: `pub-state-${Date.now()}`,
        name: 'Pub State Store',
        type: 'cafe',
        heroImageUrl: 'https://cdn.example.com/live-hero.jpg',
        isActive: true,
        publishedAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    });
    businessId = business.id;
    const draft = await prisma.draftStore.create({
      data: {
        ownerUserId: userId,
        status: 'committed',
        committedStoreId: businessId,
        committedUserId: userId,
        mode: 'template',
        input: {},
        expiresAt: new Date(Date.now() + 86400000),
        preview: {
          storeName: 'Pub State Store',
          storeType: 'cafe',
          heroImageUrl: 'https://cdn.example.com/draft-hero.jpg',
          hero: { imageUrl: 'https://cdn.example.com/draft-hero.jpg' },
          items: [{ name: 'Latte', price: 5 }],
          categories: [],
        },
      },
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    if (draftId) await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    if (businessId) await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it('detects live store with unpublished hero', async () => {
    const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
    const state = await buildDraftPublishState(prisma, draft);
    expect(state.isLive).toBe(true);
    expect(state.isFirstPublish).toBe(false);
    expect(state.hasUnpublishedChanges).toBe(true);
    expect(state.changeHints).toContain('Hero image');
    expect(state.liveHeroUrl).toBe('https://cdn.example.com/live-hero.jpg');
    expect(state.draftHeroUrl).toBe('https://cdn.example.com/draft-hero.jpg');
    expect(state.publishedAt).toBeTruthy();
  });

  it('detects unpublished video hero when draft has video and live has image only', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        heroImageUrl: 'https://cdn.example.com/live-hero.jpg',
        stylePreferences: { heroImage: 'https://cdn.example.com/live-hero.jpg' },
      },
    });
    await prisma.draftStore.update({
      where: { id: draftId },
      data: {
        preview: {
          storeName: 'Pub State Store',
          storeType: 'cafe',
          heroMediaType: 'video',
          heroVideoUrl: 'https://cdn.example.com/draft-video.mp4',
          heroVideo: 'https://cdn.example.com/draft-video.mp4',
          hero: { type: 'video', videoUrl: 'https://cdn.example.com/draft-video.mp4' },
          items: [{ name: 'Latte', price: 5 }],
          categories: [],
        },
      },
    });
    const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
    const state = await buildDraftPublishState(prisma, draft);
    expect(state.hasUnpublishedChanges).toBe(true);
    expect(state.changeHints.some((h) => h.includes('Hero'))).toBe(true);
    expect(state.draftHeroUrl).toBe('https://cdn.example.com/draft-video.mp4');
  });
});
