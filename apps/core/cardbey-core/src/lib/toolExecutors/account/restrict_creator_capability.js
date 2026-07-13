import { restrictCreatorCapability } from '../../account/userAccountAdminService.js';

export async function execute(input = {}, context = {}) {
  const userId = input?.userId?.trim();
  if (!userId) return { status: 'failed', error: { code: 'MISSING_USER_ID', message: 'userId required' } };
  try {
    const result = await restrictCreatorCapability(userId, {
      actorUserId: context.userId ?? null,
      internalNote: input.internalNote ?? null,
      reasonCode: input.reasonCode ?? null,
    });
    return { status: 'ok', output: { profile: result } };
  } catch (err) {
    return { status: 'failed', error: { code: 'RESTRICT_FAILED', message: err.message } };
  }
}

export default { execute };
