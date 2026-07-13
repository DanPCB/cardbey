import { updateUserAccountStatus } from '../../account/userAccountAdminService.js';

export async function execute(input = {}, context = {}) {
  const userId = input?.userId?.trim();
  const status = input?.status;
  if (!userId || !status) {
    return { status: 'failed', error: { code: 'MISSING_FIELDS', message: 'userId and status required' } };
  }
  try {
    const result = await updateUserAccountStatus(userId, status, {
      actorUserId: context.userId ?? null,
      actorRole: context.role ?? null,
      reasonCode: input.reasonCode ?? null,
      internalNote: input.internalNote ?? null,
      publicReason: input.publicReason ?? null,
    });
    return { status: 'ok', output: { profile: result } };
  } catch (err) {
    return { status: 'failed', error: { code: 'STATUS_UPDATE_FAILED', message: err.message } };
  }
}

export default { execute };
