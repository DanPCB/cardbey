/**
 * create_creator_profile — Runtime Authority tool.
 */

import { createCreatorProfileRecord } from '../../creator/creatorContentService.js';
import { isCreatorProfileValidationError } from '../../creator/creatorProfileContract.js';
import { logCreatorProfileTelemetry } from '../../creator/creatorProfileTelemetry.js';

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

  if (context.userId && context.userId !== userId) {
    return {
      status: 'failed',
      error: {
        code: 'ACCESS_DENIED',
        message: 'Cannot create a creator profile for another user.',
      },
    };
  }

  const runtimeInput = {
    ...input,
    userId,
    source: input.source || context.source || 'creator_studio',
    requestId: context.runtimeExecutionId || input.requestId || null,
    runtimeMissionId: context.missionId || input.runtimeMissionId || null,
  };

  try {
    const creator = await createCreatorProfileRecord(userId, runtimeInput);
    return {
      status: 'ok',
      output: {
        creator,
        missionId: context.missionId ?? null,
        source: runtimeInput.source,
      },
    };
  } catch (err) {
    logCreatorProfileTelemetry('creator_profile_create_failed', {
      userId,
      code: err?.code,
      message: err instanceof Error ? err.message : String(err),
    });

    if (isCreatorProfileValidationError(err) || err?.fields) {
      return {
        status: 'failed',
        error: {
          code: err.code || 'CREATOR_PROFILE_VALIDATION_FAILED',
          message: err.message || 'Profile validation failed.',
          fields: err.fields || {},
        },
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      error: { code: 'CREATE_CREATOR_PROFILE_ERROR', message },
    };
  }
}

export default { execute };
