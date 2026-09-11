/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createActivityComment,
  listActivityComments,
  publicLifecycleContentKey,
  sanitizeCommentText,
} from '../activityCommentService.js';

const prisma = new PrismaClient();
const hasComment = typeof prisma.comment?.create === 'function';

describe.skipIf(!hasComment)('activityCommentService', () => {
  /** @type {string | null} */
  let userId = null;
  /** @type {string | null} */
  let storeId = null;
  /** @type {string | null} */
  let activityId = null;
  /** @type {string[]} */
  const commentIds = [];

  beforeAll(async () => {
    const email = `comment-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'x',
        displayName: 'Comment Tester',
      },
    });
    userId = user.id;

    const store = await prisma.business.create({
      data: {
        name: 'Comment Test Store',
        slug: `comment-test-${Date.now()}`,
        userId: user.id,
        type: 'retail',
      },
    });
    storeId = store.id;

    const event = await prisma.storeActivityEvent.create({
      data: {
        storeId: store.id,
        actorUserId: user.id,
        eventType: 'SPACE_UPDATE',
        source: 'public_lifecycle',
        metadataJson: { text: 'hello', distribution: 'GLOBAL_ELIGIBLE' },
      },
    });
    activityId = event.id;
  });

  afterAll(async () => {
    if (commentIds.length) {
      await prisma.comment.deleteMany({ where: { id: { in: commentIds } } }).catch(() => {});
    }
    if (activityId) await prisma.storeActivityEvent.delete({ where: { id: activityId } }).catch(() => {});
    if (storeId) await prisma.business.delete({ where: { id: storeId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('sanitizes empty and strips tags', () => {
    expect(sanitizeCommentText('')).toBeNull();
    expect(sanitizeCommentText('   ')).toBeNull();
    expect(sanitizeCommentText('<b>Hi</b> there')).toBe('Hi there');
  });

  it('rejects missing auth actor', async () => {
    const key = publicLifecycleContentKey(activityId);
    const result = await createActivityComment(prisma, {
      contentType: key.contentType,
      contentId: key.contentId,
      text: 'no actor',
      actorUserId: '',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejects empty text', async () => {
    const key = publicLifecycleContentKey(activityId);
    const result = await createActivityComment(prisma, {
      contentType: key.contentType,
      contentId: key.contentId,
      text: '   ',
      actorUserId: userId,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('empty_comment');
  });

  it('rejects unknown activity', async () => {
    const key = publicLifecycleContentKey('does-not-exist-activity');
    const result = await createActivityComment(prisma, {
      contentType: key.contentType,
      contentId: key.contentId,
      text: 'orphan',
      actorUserId: userId,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('creates comment, lists it, syncs commentsCount', async () => {
    const key = publicLifecycleContentKey(activityId);
    const created = await createActivityComment(prisma, {
      contentType: key.contentType,
      contentId: key.contentId,
      text: 'Canonical comment test',
      actorUserId: userId,
      storeId,
    });
    expect(created.ok).toBe(true);
    expect(created.comment?.text).toBe('Canonical comment test');
    expect(created.total).toBe(1);
    commentIds.push(created.comment.id);

    const listed = await listActivityComments(prisma, {
      contentType: key.contentType,
      contentId: key.contentId,
    });
    expect(listed.ok).toBe(true);
    expect(listed.total).toBe(1);
    expect(listed.comments[0]?.id).toBe(created.comment.id);
    expect(listed.comments[0]?.actor?.displayName).toBeTruthy();

    const metrics = await prisma.contentInteractionMetrics.findUnique({
      where: {
        contentType_contentId: {
          contentType: key.contentType,
          contentId: key.contentId,
        },
      },
    });
    expect(metrics?.commentsCount).toBe(1);
  });
});
