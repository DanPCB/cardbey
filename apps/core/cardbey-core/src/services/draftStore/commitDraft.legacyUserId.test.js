/**
 * Legacy Business.userId unique — second store commit must reuse owned business, not COMMIT_DRAFT_FAILED.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { preflightBusinessCommitPlan, isCommitBusinessRetryableError } from './commitDraftBusinessResolve.js';

describe('preflightBusinessCommitPlan legacy userId unique', () => {
  let userId;
  let businessId;
  const prevLegacy = process.env.LEGACY_BUSINESS_USER_ID_UNIQUE;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `legacy-userid-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Legacy UserId',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: {
        userId,
        slug: `legacy-owned-${Date.now()}`,
        name: 'First Store',
        type: 'cafe',
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    process.env.LEGACY_BUSINESS_USER_ID_UNIQUE = prevLegacy;
    if (businessId) {
      await prisma.product.deleteMany({ where: { businessId } }).catch(() => {});
      await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    }
    if (userId) {
      await prisma.business.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  beforeEach(() => {
    process.env.LEGACY_BUSINESS_USER_ID_UNIQUE = 'true';
    process.env.MULTI_STORE_IDENTITY_V1 = 'true';
  });

  afterEach(() => {
    process.env.LEGACY_BUSINESS_USER_ID_UNIQUE = prevLegacy;
  });

  it('plans update (reuse owned) for second store when legacy userId unique is enabled', async () => {
    const plan = await preflightBusinessCommitPlan(prisma, {
      user: { id: userId },
      draft: { id: 'draft-second-store', input: {} },
      businessName: 'Second Store Name',
      businessFields: { userId },
      writeMode: { mode: 'create', storeId: null, reason: 'new_store' },
    });
    expect(plan.action).toBe('update');
    expect(plan.businessId).toBe(businessId);
    expect(plan.path).toBe('legacy_user_id_unique_reuse');
  });

  it('treats slug and userId P2002 as retryable', () => {
    expect(isCommitBusinessRetryableError({ code: 'P2002', meta: { target: ['userId'] } })).toBe(true);
    expect(isCommitBusinessRetryableError({ code: 'P2002', meta: { target: ['slug'] } })).toBe(true);
    expect(isCommitBusinessRetryableError({ code: '25P02', message: 'current transaction is aborted' })).toBe(true);
  });
});
