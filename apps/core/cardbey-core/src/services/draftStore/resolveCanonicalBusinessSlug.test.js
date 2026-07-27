/**
 * Canonical publish slug — auto refresh on rename, manual lock preserved, collision suffix.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import {
  applyCanonicalSlugOnPublish,
  readSlugPublishMeta,
  resolveCanonicalBusinessSlug,
} from './resolveCanonicalBusinessSlug.js';

describe('resolveCanonicalBusinessSlug', () => {
  let ownerId;
  let businessId;
  const suffix = Date.now();

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `slug-owner-${suffix}@test.local`,
        passwordHash: 'test',
        displayName: 'Slug Owner',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    ownerId = user.id;
    const biz = await prisma.business.create({
      data: {
        userId: ownerId,
        name: 'Old Vietnamese Name',
        slug: `b-nh-cu-n-b-nguyen-${suffix}`,
        type: 'cafe',
        stylePreferences: { slugSource: 'auto' },
      },
    });
    businessId = biz.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    }
    if (ownerId) {
      await prisma.user.deleteMany({ where: { id: ownerId } }).catch(() => {});
    }
  });

  it('republish renames auto slug from current store name (My Cafe)', async () => {
    const applied = await applyCanonicalSlugOnPublish(prisma, {
      businessId,
      storeName: 'My Cafe',
    });
    expect(applied?.slug).toMatch(/^my-cafe(-\d+)?$/);
    const row = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true, name: true } });
    expect(row?.name).toBe('My Cafe');
    expect(row?.slug).toBe(applied.slug);
    expect(row?.slug).not.toBe(`b-nh-cu-n-b-nguyen-${suffix}`);
  });

  it('preserves manual locked slug when name changes', async () => {
    const lockedSlug = `custom-lock-${suffix}`;
    await prisma.business.update({
      where: { id: businessId },
      data: {
        slug: lockedSlug,
        stylePreferences: { slugSource: 'manual', slugLocked: true },
      },
    });
    const resolved = await resolveCanonicalBusinessSlug(prisma, {
      businessId,
      currentName: 'Totally Different Name',
      existingSlug: lockedSlug,
      stylePreferences: { slugSource: 'manual', slugLocked: true },
    });
    expect(resolved.slug).toBe(lockedSlug);
    expect(resolved.slugSource).toBe('manual');
    expect(resolved.updated).toBe(false);
  });

  it('readSlugPublishMeta treats missing meta as auto', () => {
    expect(readSlugPublishMeta(null)).toEqual({ slugLocked: false, slugSource: 'auto' });
  });
});

describe('resolveCanonicalBusinessSlug collision', () => {
  it('appends numeric suffix when base slug is taken by another store', async () => {
    const suffix = Date.now();
    const storeLabel = `Collision Cafe ${suffix}`;
    const taken = `collision-cafe-${suffix}`;
    const other = await prisma.user.create({
      data: {
        email: `slug-other-${suffix}@test.local`,
        passwordHash: 'test',
        displayName: 'Other',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    await prisma.business.create({
      data: { userId: other.id, name: storeLabel, slug: taken, type: 'cafe' },
    });
    const owner = await prisma.user.create({
      data: {
        email: `slug-owner2-${suffix}@test.local`,
        passwordHash: 'test',
        displayName: 'Owner2',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    const mine = await prisma.business.create({
      data: {
        userId: owner.id,
        name: 'Legacy',
        slug: `legacy-${suffix}`,
        type: 'cafe',
        stylePreferences: { slugSource: 'auto' },
      },
    });
    const resolved = await resolveCanonicalBusinessSlug(prisma, {
      businessId: mine.id,
      currentName: storeLabel,
      existingSlug: mine.slug,
      stylePreferences: { slugSource: 'auto' },
    });
    expect(resolved.slug).not.toBe(taken);
    expect(resolved.slug).toMatch(new RegExp(`^collision-cafe-${suffix}-\\d+$`));
    expect(resolved.slug).not.toBe(mine.slug);
    await prisma.business.deleteMany({ where: { userId: { in: [other.id, owner.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [other.id, owner.id] } } }).catch(() => {});
  });
});
