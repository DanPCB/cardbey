/**
 * return_creator_content_to_draft — Runtime Authority tool.
 */

import { returnCreatorContentToDraft } from '../../creator/creatorContentService.js';
import { toCreatorContentErrorPayload } from '../../creator/creatorContentErrors.js';
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

    const content = await returnCreatorContentToDraft(contentId, context);
    return {
      status: 'ok',
      output: { content, missionId: context.missionId ?? null },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: toCreatorContentErrorPayload(err),
    };
  }
}

export default { execute };
