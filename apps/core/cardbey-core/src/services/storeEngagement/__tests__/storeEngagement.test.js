/**
 * Tests for canonical store engagement pipeline.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { computeEngagementScore } from '../storeEngagementTypes.js';
import { recordStoreEngagementEvent } from '../storeEngagementEventService.js';
import {
  toggleStoreLike,
  recordStoreView,
  getStoreEngagementSummary,
} from '../storeEngagementActionService.js';
import { buildActorKey } from '../storeEngagementActor.js';

describe('storeEngagement', () => {
  let storeId;

  beforeEach(async () => {
    const suffix = Date.now();
    const user = await prisma.user.create({
      data: {
        email: `eng-${suffix}@test.local`,
        passwordHash: 'x',
        role: 'owner',
      },
    });
    const business = await prisma.business.create({
      data: {
        userId: user.id,
        name: 'Engagement Test Cafe',
        type: 'cafe',
        slug: `eng-cafe-${Date.now()}`,
        isActive: true,
        publishedAt: new Date(),
      },
    });
    storeId = business.id;
  });

  afterEach(async () => {
    if (!storeId) return;
    await prisma.storeActivityEvent.deleteMany({ where: { storeId } });
    await prisma.storeEngagementSnapshot.deleteMany({ where: { storeId } });
    await prisma.storeReaction.deleteMany({ where: { storeId } });
    await prisma.storeFollow.deleteMany({ where: { storeId } });
    await prisma.storeSave.deleteMany({ where: { storeId } });
    await prisma.storeShare.deleteMany({ where: { storeId } });
    await prisma.offerClaim.deleteMany({ where: { storeId } });
    const biz = await prisma.business.findUnique({ where: { id: storeId }, select: { userId: true } });
    await prisma.business.deleteMany({ where: { id: storeId } });
    if (biz?.userId) await prisma.user.deleteMany({ where: { id: biz.userId } });
  });

  it('computeEngagementScore uses weighted formula', () => {
    const score = computeEngagementScore({
      views7d: 10,
      likesCount: 2,
      savesCount: 1,
      sharesCount: 1,
      followersCount: 3,
      orderClicksCount: 1,
      offerClaimsCount: 1,
    });
    expect(score).toBe(10 + 10 + 8 + 10 + 36 + 15 + 20);
  });

  it('records view event and updates snapshot', async () => {
    const result = await recordStoreView(prisma, {
      storeId,
      viewerKey: 'viewer-a',
      sessionId: 'sess-a',
      source: 'feed',
    });
    expect(result.ok).toBe(true);

    const snap = await prisma.storeEngagementSnapshot.findUnique({ where: { storeId } });
    expect(snap?.viewsCount).toBe(1);
    expect(snap?.views7d).toBe(1);
    expect(snap?.engagementScore).toBeGreaterThan(0);
  });

  it('dedupes views within 30 minutes per session/source', async () => {
    await recordStoreView(prisma, {
      storeId,
      viewerKey: 'viewer-b',
      sessionId: 'sess-b',
      source: 'feed',
    });
    const second = await recordStoreView(prisma, {
      storeId,
      viewerKey: 'viewer-b',
      sessionId: 'sess-b',
      source: 'feed',
    });
    expect(second.deduped).toBe(true);

    const snap = await prisma.storeEngagementSnapshot.findUnique({ where: { storeId } });
    expect(snap?.viewsCount).toBe(1);
  });

  it('toggle like updates snapshot and viewer state', async () => {
    const liked = await toggleStoreLike(prisma, {
      storeId,
      viewerKey: 'viewer-c',
      source: 'feed',
    });
    expect(liked.ok).toBe(true);
    expect(liked.liked).toBe(true);
    expect(liked.engagement.likesCount).toBe(1);

    const unliked = await toggleStoreLike(prisma, {
      storeId,
      viewerKey: 'viewer-c',
      source: 'feed',
    });
    expect(unliked.liked).toBe(false);
    expect(unliked.engagement.likesCount).toBe(0);
  });

  it('buildActorKey prefers user id over viewer key', () => {
    expect(buildActorKey({ userId: 'u1', viewerKey: 'vk' })).toBe('user:u1');
    expect(buildActorKey({ viewerKey: 'vk' })).toBe('viewer:vk');
  });

  it('getStoreEngagementSummary returns public engagement shape', async () => {
    await recordStoreEngagementEvent(prisma, {
      storeId,
      eventType: 'STORE_FOLLOWED',
      source: 'feed',
    });

    const summary = await getStoreEngagementSummary(prisma, {
      storeId,
      viewerKey: 'anon',
    });
    expect(summary.engagement.followersCount).toBe(1);
    expect(summary.engagement).toHaveProperty('engagementScore');
    expect(summary.viewer).toHaveProperty('viewerIsFollowing');
  });
});
