import { restoreCreatorCapability } from '../../account/userAccountAdminService.js';

export async function execute(input = {}, context = {}) {
  const userId = input?.userId?.trim();
  if (!userId) return { status: 'failed', error: { code: 'MISSING_USER_ID', message: 'userId required' } };
  try {
    const result = await restoreCreatorCapability(userId, {
      actorUserId: context.userId ?? null,
      internalNote: input.internalNote ?? null,
    });
    return { status: 'ok', output: { profile: result } };
  } catch (err) {
    return { status: 'failed', error: { code: 'RESTORE_FAILED', message: err.message } };
  }
}

export default { execute };
