import { addUserAccountNote } from '../../account/userAccountAdminService.js';

export async function execute(input = {}, context = {}) {
  const userId = input?.userId?.trim();
  const note = input?.note ?? input?.internalNote;
  if (!userId || !note) {
    return { status: 'failed', error: { code: 'MISSING_FIELDS', message: 'userId and note required' } };
  }
  try {
    const notes = await addUserAccountNote(userId, String(note), {
      actorUserId: context.userId ?? null,
    });
    return { status: 'ok', output: { notes } };
  } catch (err) {
    return { status: 'failed', error: { code: 'NOTE_FAILED', message: err.message } };
  }
}

export default { execute };
