import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma.js';
import {
  addContentClap,
  getContentInteractionSummary,
  recordContentShare,
  recordContentView,
  toggleContentLove,
} from '../services/contentInteractionService.js';

describe('contentInteractionService', () => {
  const contentType = 'feed_artifact';
  const contentId = 'store:test-1';
  const viewerKey = 'viewer-a';

  beforeEach(async () => {
    await prisma.contentInteractionViewerState.deleteMany({});
    await prisma.contentInteractionMetrics.deleteMany({
      where: { contentType, contentId },
    });
  });

  it('returns zero counts for unknown content', async () => {
    const summary = await getContentInteractionSummary(prisma, {
      contentType,
      contentId,
      viewerKey,
    });
    expect(summary.viewsCount).toBe(0);
    expect(summary.lovesCount).toBe(0);
  });

  it('records one view per viewer session', async () => {
    const first = await recordContentView(prisma, {
      contentType,
      contentId,
      viewerKey,
      storeId: 'store-1',
      artifactId: contentId,
    });
    const second = await recordContentView(prisma, {
      contentType,
      contentId,
      viewerKey,
    });
    expect(first.viewsCount).toBe(1);
    expect(second.viewsCount).toBe(1);
  });

  it('toggle love updates count and viewer state', async () => {
    const loved = await toggleContentLove(prisma, { contentType, contentId, viewerKey });
    expect(loved.lovesCount).toBe(1);
    expect(loved.viewerState.loved).toBe(true);
    const unloved = await toggleContentLove(prisma, { contentType, contentId, viewerKey });
    expect(unloved.lovesCount).toBe(0);
    expect(unloved.viewerState.loved).toBe(false);
  });

  it('addClap increments clapsCount', async () => {
    const once = await addContentClap(prisma, { contentType, contentId, viewerKey });
    const twice = await addContentClap(prisma, { contentType, contentId, viewerKey });
    expect(once.clapsCount).toBe(1);
    expect(twice.clapsCount).toBe(2);
  });

  it('share increments once per viewer', async () => {
    const first = await recordContentShare(prisma, { contentType, contentId, viewerKey });
    const second = await recordContentShare(prisma, { contentType, contentId, viewerKey });
    expect(first.sharesCount).toBe(1);
    expect(second.sharesCount).toBe(1);
  });
});
