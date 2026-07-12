/**
 * submit_creator_content_for_review — Runtime Authority tool.
 */

import { submitCreatorContentForReview } from '../../creator/creatorContentService.js';
import { toCreatorContentErrorPayload } from '../../creator/creatorContentErrors.js';
import { enqueueCreatorClassificationPipeline } from '../../creator/publishing/creatorClassificationService.js';
import { getPrismaClient } from '../../prisma.js';

export async function execute(input = {}, context = {}) {
  const contentId = input?.contentId?.trim();
  if (!contentId) {
    return {
      status: 'failed',
      error: { code: 'MISSING_CONTENT_ID', message: 'contentId is required' },
    };
  }

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.creatorContent.findUnique({
      where: { id: contentId },
      include: { creator: { select: { userId: true } } },
    });

    if (!existing) {
      return {
        status: 'failed',
        error: { code: 'CONTENT_NOT_FOUND', message: 'Content not found' },
      };
    }

    const userId = context?.userId;
    if (userId && existing.creator?.userId !== userId) {
      return {
        status: 'blocked',
        blocker: { code: 'ACCESS_DENIED', message: 'Not content owner' },
      };
    }

    const content = await submitCreatorContentForReview(contentId, context);

    let classification = null;
    try {
      classification = await enqueueCreatorClassificationPipeline(contentId, {
        actorType: 'system',
        actorId: context.userId ?? null,
        requestId: context.runtimeExecutionId ?? null,
      });
    } catch (classifyErr) {
      classification = {
        status: 'failed',
        message: classifyErr instanceof Error ? classifyErr.message : String(classifyErr),
      };
    }

    return {
      status: 'ok',
      output: {
        content,
        classification,
        missionId: context.missionId ?? null,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: toCreatorContentErrorPayload(err),
    };
  }
}

export default { execute };
