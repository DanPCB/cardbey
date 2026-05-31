/**
 * Committed draft hero patch must sync Business.heroImageUrl (and projection when available).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { patchDraftPreview } from './draftStoreService.js';

describe('patchDraftPreview committed hero', () => {
  let userId;
  let businessId;
  let draftId;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `hero-patch-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Hero Patch',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: {
        userId,
        slug: `hero-patch-store-${Date.now()}`,
        name: 'Hero Patch Store',
        type: 'cafe',
        heroImageUrl: 'https://cdn.example.com/old-hero.jpg',
        isActive: true,
        publishedAt: new Date(),
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
          storeName: 'Hero Patch Store',
          storeType: 'cafe',
          heroImageUrl: 'https://cdn.example.com/old-hero.jpg',
          hero: { imageUrl: 'https://cdn.example.com/old-hero.jpg', url: 'https://cdn.example.com/old-hero.jpg' },
          items: [],
          categories: [],
        },
      },
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    if (draftId) await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    if (businessId) {
      await prisma.publishedArtifactProjection?.deleteMany?.({ where: { businessId } }).catch(() => {});
      await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it('persists heroImageUrl to DraftStore preview when store is already live (draft-only until republish)', async () => {
    const newUrl = 'https://cdn.example.com/new-hero.jpg';
    await patchDraftPreview(draftId, {
      heroImageUrl: newUrl,
      hero: { type: 'image', imageUrl: newUrl, url: newUrl },
    });

    const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
    const preview =
      typeof draft?.preview === 'string' ? JSON.parse(draft.preview) : draft?.preview;
    expect(preview?.heroImageUrl).toBe(newUrl);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { heroImageUrl: true, stylePreferences: true },
    });
    expect(business?.heroImageUrl).toBe('https://cdn.example.com/old-hero.jpg');
  });
});
