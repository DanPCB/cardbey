/**
 * commitDraft business preflight — no in-transaction recovery after P2002 (25P02 guard).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { preflightBusinessCommitPlan, isAbortedTransactionError } from './commitDraftBusinessResolve.js';

describe('preflightBusinessCommitPlan', () => {
  let userId;
  let businessId;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `preflight-commit-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Preflight',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: {
        userId,
        slug: `preflight-store-${Date.now()}`,
        name: 'Existing Store',
        type: 'cafe',
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.product.deleteMany({ where: { businessId } }).catch(() => {});
      await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  it('plans update when draft already committed to owned store', async () => {
    const plan = await preflightBusinessCommitPlan(prisma, {
      user: { id: userId },
      draft: { id: 'draft-preflight-1', committedStoreId: businessId, input: {} },
      businessFields: { userId },
      writeMode: { mode: 'legacy', storeId: null, reason: 'legacy_singleton' },
    });
    expect(plan.action).toBe('update');
    expect(plan.businessId).toBe(businessId);
  });

  it('detects aborted transaction error code', () => {
    const err = { code: '25P02', message: 'current transaction is aborted' };
    expect(isAbortedTransactionError(err)).toBe(true);
  });
});
