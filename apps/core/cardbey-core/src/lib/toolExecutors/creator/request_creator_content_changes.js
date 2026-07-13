/**
 * request_creator_content_changes — Runtime Authority tool.
 */
import { requestCreatorPublishingChanges } from '../../creator/publishing/creatorPublishingService.js';
import { toCreatorContentErrorPayload } from '../../creator/creatorContentErrors.js';

export async function execute(input = {}, context = {}) {
  const contentId = input?.contentId?.trim();
  if (!contentId) {
    return { status: 'failed', error: { code: 'MISSING_CONTENT_ID', message: 'contentId is required' } };
  }
  try {
    const content = await requestCreatorPublishingChanges(contentId, input, {
      reviewerUserId: context.userId ?? null,
    });
    return { status: 'ok', output: { content } };
  } catch (err) {
    return { status: 'failed', error: toCreatorContentErrorPayload(err) };
  }
}

export default { execute };
