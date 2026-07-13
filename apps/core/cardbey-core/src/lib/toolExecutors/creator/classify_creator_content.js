/**
 * classify_creator_content — Runtime Authority tool (admin re-run).
 */
import { runCreatorClassification } from '../../creator/publishing/creatorClassificationService.js';
import { toCreatorContentErrorPayload } from '../../creator/creatorContentErrors.js';

export async function execute(input = {}, context = {}) {
  const contentId = input?.contentId?.trim();
  if (!contentId) {
    return { status: 'failed', error: { code: 'MISSING_CONTENT_ID', message: 'contentId is required' } };
  }
  try {
    const result = await runCreatorClassification(contentId, {
      actorType: context.role === 'platform_admin' ? 'admin' : 'agent',
      actorId: context.userId ?? null,
      requestId: context.runtimeExecutionId ?? null,
      rerun: true,
    });
    return { status: 'ok', output: result };
  } catch (err) {
    return { status: 'failed', error: toCreatorContentErrorPayload(err) };
  }
}

export default { execute };
