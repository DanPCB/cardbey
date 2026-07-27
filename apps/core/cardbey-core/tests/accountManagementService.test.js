import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  adminDeleteUser,
  listDuplicateStoreGroups,
} from '../src/lib/admin/accountManagementService.js';
import { resetDb } from '../src/test/helpers/resetDb.js';

const prisma = new PrismaClient();

function mockPrisma(businesses) {
  return {
    business: {
      findMany: async () => businesses,
    },
  };
}

describe('accountManagementService', () => {
  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('groups near-duplicate AA Travel stores', async () => {
    const businesses = [
      {
        id: 'store-and',
        name: 'AA Travel and Golf Tour',
        slug: 'aa-travel-and-golf-tour',
        userId: 'user-a',
        isActive: true,
        publishedAt: new Date('2026-01-01'),
        isGuestDraft: false,
        expiresAt: null,
        createdAt: new Date('2026-01-01'),
        user: { id: 'user-a', email: 'a@test.com', displayName: 'A', role: 'owner', emailVerified: true },
      },
      {
        id: 'store-amp',
        name: 'AA Travel & Golf Tour',
        slug: 'aa-travel-golf-tour',
        userId: 'user-b',
        isActive: true,
        publishedAt: new Date('2026-02-01'),
        isGuestDraft: false,
        expiresAt: null,
        createdAt: new Date('2026-02-01'),
        user: { id: 'user-b', email: 'b@test.com', displayName: 'B', role: 'owner', emailVerified: true },
      },
    ];

    const result = await listDuplicateStoreGroups(mockPrisma(businesses));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].recommendedKeepId).toBe('store-amp');
    expect(result.groups[0].stores.find((s) => s.recommendedKeep)?.id).toBe('store-amp');
  });

  it('adminDeleteUser removes guest users with performer missions', async () => {
    const guest = await prisma.user.create({
      data: {
        id: 'guest_test-delete-1',
        email: 'guest_test-delete-1@guest.cardbey.internal',
        passwordHash: 'hash',
        displayName: 'Guest Delete Test',
        role: 'guest',
        roles: '["viewer"]',
      },
    });

    await prisma.mission.create({
      data: {
        id: 'mission-guest-delete-1',
        tenantId: guest.id,
        createdByUserId: guest.id,
        title: 'Guest store mission',
        status: 'completed',
      },
    });

    const result = await adminDeleteUser(prisma, guest.id);
    expect(result.id).toBe(guest.id);

    const remaining = await prisma.user.findUnique({ where: { id: guest.id } });
    expect(remaining).toBeNull();
    const mission = await prisma.mission.findUnique({ where: { id: 'mission-guest-delete-1' } });
    expect(mission).toBeNull();
  });
});
