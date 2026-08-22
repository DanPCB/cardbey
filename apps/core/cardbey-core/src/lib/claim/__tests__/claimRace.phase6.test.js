/**
 * Phase 6 — concurrent claim uniqueness helpers + Business.seedId unique catch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../../prisma.js';
import { hasBusinessColumn, resetBusinessColumnSupportCache } from '../../businessColumnCapabilities.js';
import { isBusinessSeedIdUniqueViolation } from '../seedClaimLock.js';
import { withClaimLock } from '../claimLock.js';

describe('claimLock mutex', () => {
  it('serializes concurrent critical sections for the same key', async () => {
    const order = [];
    await Promise.all([
      withClaimLock('k1', async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 30));
        order.push('a-end');
      }),
      withClaimLock('k1', async () => {
        order.push('b-start');
        order.push('b-end');
      }),
    ]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });
});

describe('isBusinessSeedIdUniqueViolation', () => {
  it('detects Prisma P2002 on seedId', () => {
    expect(
      isBusinessSeedIdUniqueViolation({
        code: 'P2002',
        meta: { target: ['seedId'] },
      }),
    ).toBe(true);
    expect(isBusinessSeedIdUniqueViolation({ code: 'P2002', meta: { target: ['slug'] } })).toBe(false);
    expect(
      isBusinessSeedIdUniqueViolation({
        code: 'P2002',
        message: 'Unique constraint failed on Business_seedId_unique',
      }),
    ).toBe(true);
  });
});

describe('Business.seedId column + unique index', () => {
  beforeEach(() => {
    resetBusinessColumnSupportCache();
  });

  afterEach(() => {
    resetBusinessColumnSupportCache();
  });

  it('hasBusinessColumn(seedId) is true after migration', () => {
    expect(hasBusinessColumn('seedId')).toBe(true);
  });

  it('unique seedId rejects a second Business with same seedId', async () => {
    const prisma = getPrismaClient();
    if (!hasBusinessColumn('seedId')) {
      throw new Error('seedId column missing — run sqlite migration 20260814140000');
    }

    const suffix = Date.now();
    let user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `phase6-race-${suffix}@example.com`,
          passwordHash: 'phase6-test-hash',
        },
      });
    }

    const seedId = `phase6-seed-${suffix}`;
    const a = await prisma.business.create({
      data: {
        userId: user.id,
        name: 'Phase6 A',
        type: 'cafe',
        slug: `phase6-a-${suffix}`,
        seedId,
      },
    });

    let rejected = false;
    try {
      await prisma.business.create({
        data: {
          userId: user.id,
          name: 'Phase6 B',
          type: 'cafe',
          slug: `phase6-b-${suffix}`,
          seedId,
        },
      });
    } catch (err) {
      rejected = isBusinessSeedIdUniqueViolation(err) || err?.code === 'P2002';
    }

    expect(rejected).toBe(true);
    await prisma.business.delete({ where: { id: a.id } }).catch(() => undefined);
  });
});
