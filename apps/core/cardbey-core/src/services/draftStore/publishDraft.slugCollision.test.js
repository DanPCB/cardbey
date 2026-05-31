/**
 * publishDraft business preflight — slug collision auto-resolves; no in-tx recovery (25P02 guard).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import {
  preflightPublishBusinessPlan,
  executePublishBusinessPlan,
  isPublishBusinessRetryableError,
  friendlyPublishIdentityError,
} from './publishDraftBusinessResolve.js';

describe('preflightPublishBusinessPlan slug collision', () => {
  let ownerId;
  let otherUserId;
  let otherBusinessId;
  const slugSuffix = Date.now();
  const takenSlug = `collision-cafe-${slugSuffix}`;
  const storeName = `Collision Cafe ${slugSuffix}`;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `publish-owner-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Publish Owner',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    ownerId = owner.id;

    const other = await prisma.user.create({
      data: {
        email: `publish-other-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Other User',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    otherUserId = other.id;

    const otherBiz = await prisma.business.create({
      data: {
        userId: otherUserId,
        slug: takenSlug,
        name: 'Collision Cafe',
        type: 'cafe',
      },
    });
    otherBusinessId = otherBiz.id;
  });

  afterAll(async () => {
    if (otherBusinessId) {
      await prisma.product.deleteMany({ where: { businessId: otherBusinessId } }).catch(() => {});
      await prisma.business.delete({ where: { id: otherBusinessId } }).catch(() => {});
    }
    if (ownerId) {
      await prisma.business.deleteMany({ where: { userId: ownerId } }).catch(() => {});
      await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
    }
    if (otherUserId) {
      await prisma.user.delete({ where: { id: otherUserId } }).catch(() => {});
    }
  });

  it('generates unique slug when intended slug belongs to another user', async () => {
    process.env.MULTI_STORE_IDENTITY_V1 = 'true';
    const plan = await preflightPublishBusinessPlan(prisma, {
      ownerId,
      targetDraft: { id: 'draft-slug-collision', committedStoreId: null },
      storeName,
      storeType: 'cafe',
      isTempStore: true,
      existingStoreId: null,
    });
    expect(plan.action).toBe('create');
    expect(plan.intendedSlug).toBe(takenSlug);
    expect(plan.finalSlug).not.toBe(takenSlug);
    expect(plan.finalSlug).toMatch(new RegExp(`^collision-cafe-${slugSuffix}-\\d+$`));
  });

  it('executePublishBusinessPlan does not catch+findFirst after failed create', async () => {
    const plan = {
      action: 'create',
      path: 'create_new_business',
      intendedSlug: takenSlug,
      finalSlug: takenSlug,
    };
    const tx = {
      business: {
        create: vi.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['slug'] } }),
        findFirst: vi.fn(),
      },
    };
    await expect(
      executePublishBusinessPlan(tx, plan, {
        ownerId,
        targetDraft: { id: 'draft-exec' },
        storeName: 'Collision Cafe',
        storeType: 'cafe',
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(tx.business.findFirst).not.toHaveBeenCalled();
  });

  it('marks P2002 slug conflict as retryable and maps friendly message', () => {
    const err = { code: 'P2002', meta: { target: ['slug'] } };
    expect(isPublishBusinessRetryableError(err)).toBe(true);
    const friendly = friendlyPublishIdentityError(err);
    expect(friendly?.code).toBe('STORE_SLUG_TAKEN');
    expect(friendly?.message).toContain('store address is already taken');
  });

  it('does not expose 25P02 raw message to frontend mapping', () => {
    const friendly = friendlyPublishIdentityError({
      code: '25P02',
      message: 'current transaction is aborted, commands ignored until end of transaction block',
    });
    expect(friendly?.code).toBe('STORE_PUBLISH_RETRY');
    expect(friendly?.message).not.toContain('25P02');
    expect(friendly?.message).not.toContain('aborted');
  });
});
