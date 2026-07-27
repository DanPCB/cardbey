import { manageUserCapability } from '../../account/userAccountAdminService.js';

export async function execute(input = {}, context = {}) {
  const userId = input?.userId?.trim();
  if (!userId || !input.action || !input.capability) {
    return { status: 'failed', error: { code: 'MISSING_FIELDS', message: 'userId, action, capability required' } };
  }
  try {
    const result = await manageUserCapability(userId, input, {
      actorUserId: context.userId ?? null,
      actorRole: context.role ?? null,
      internalNote: input.internalNote ?? null,
      reasonCode: input.reasonCode ?? null,
    });
    return { status: 'ok', output: { profile: result } };
  } catch (err) {
    return { status: 'failed', error: { code: 'CAPABILITY_FAILED', message: err.message } };
  }
}

export default { execute };
