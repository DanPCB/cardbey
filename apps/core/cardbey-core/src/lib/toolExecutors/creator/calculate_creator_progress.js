/**
 * calculate_creator_progress — Runtime Authority tool.
 */

import { syncCreatorProgress } from '../../creator/creatorProgressService.js';
import { getPrismaClient } from '../../prisma.js';
import { toPublicCreator } from '../../creator/creatorTypes.js';

export async function execute(input = {}, context = {}) {
  try {
    const prisma = getPrismaClient();
    let creatorId = input?.creatorId || context?.creatorId || null;

    if (!creatorId) {
      const userId = context?.userId || input?.userId;
      if (userId) {
        const creator = await prisma.creator.findUnique({
          where: { userId },
          select: { id: true },
        });
        creatorId = creator?.id ?? null;
      }
    }

    if (!creatorId) {
      return {
        status: 'failed',
        error: { code: 'MISSING_CREATOR', message: 'creatorId or userId required' },
      };
    }

    const { creator, progress } = await syncCreatorProgress(creatorId);

    return {
      status: 'ok',
      output: {
        creator: toPublicCreator(creator),
        progress,
        missionId: context.missionId ?? null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      error: { code: 'CALCULATE_CREATOR_PROGRESS_ERROR', message },
    };
  }
}

export default { execute };
