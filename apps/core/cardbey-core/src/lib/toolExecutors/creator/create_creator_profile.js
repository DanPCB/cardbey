/**
 * create_creator_profile — Runtime Authority tool.
 */

import { createCreatorProfileRecord } from '../../creator/creatorContentService.js';

export async function execute(input = {}, context = {}) {
  const userId =
    (typeof input?.userId === 'string' && input.userId.trim()) ||
    (typeof context?.userId === 'string' && context.userId.trim()) ||
    null;

  if (!userId) {
    return {
      status: 'failed',
      error: { code: 'MISSING_USER_ID', message: 'userId is required' },
    };
  }

  try {
    const creator = await createCreatorProfileRecord(userId, input);
    return {
      status: 'ok',
      output: { creator, missionId: context.missionId ?? null },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      error: { code: 'CREATE_CREATOR_PROFILE_ERROR', message },
    };
  }
}

export default { execute };
