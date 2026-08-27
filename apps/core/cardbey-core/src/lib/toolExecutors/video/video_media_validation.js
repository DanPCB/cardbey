/**
 * video_media_validation — ffprobe gate before Factory artifact finalize.
 */

import { validateVideoMedia } from '../../video/postProduction/videoMediaValidation.js';
import { resolveNarrationPolicy } from '../../video/postProduction/narrationPolicy.js';

export async function execute(input = {}) {
  const plan = input.approvedPlan ?? input.plan ?? {};
  const post = input.postProduction ?? input.videoPostProduction ?? {};
  const policy = resolveNarrationPolicy(plan, input.userMessage ?? '');
  const videoUrl =
    typeof post.videoUrl === 'string'
      ? post.videoUrl
      : typeof input.videoUrl === 'string'
        ? input.videoUrl
        : null;

  const result = await validateVideoMedia({
    videoUrl,
    silentVideoUrl: post.silentVideoUrl ?? input.silentVideoUrl,
    captionUrl: post.captionUrl ?? null,
    captionMode: post.captionMode ?? 'none',
    narrationRequired: policy.narrationRequired,
    silentRequested: policy.silentRequested,
    postProduction: post,
  });

  const artifactIn = post.artifact ?? input.artifact;
  const artifact =
    artifactIn && typeof artifactIn === 'object'
      ? {
          ...artifactIn,
          url: result.output?.videoUrl ?? artifactIn.url,
          metadata: {
            ...(artifactIn.metadata && typeof artifactIn.metadata === 'object' ? artifactIn.metadata : {}),
            hasAudio: result.output?.hasAudio === true,
            audioStreamCount: result.output?.audioStreamCount ?? 0,
            videoStreamCount: result.output?.videoStreamCount ?? 0,
            captionMode: result.output?.captionMode ?? post.captionMode ?? 'none',
            captionUrl: result.output?.captionUrl ?? post.captionUrl ?? null,
            validationStatus: result.output?.validationStatus ?? 'failed',
            outcomeReport: post.outcomeReport ?? null,
          },
        }
      : undefined;

  if (!result.ok || result.status === 'failed') {
    return {
      status: 'failed',
      error: result.error ?? {
        code: result.code ?? 'VIDEO_MEDIA_VALIDATION_FAILED',
        message: 'Video media validation failed',
      },
      output: { ...result.output, artifact, postProduction: post },
    };
  }

  return {
    status: 'ok',
    output: {
      ...result.output,
      artifact,
      videoUrl: result.output?.videoUrl ?? videoUrl,
      hasAudio: result.output?.hasAudio === true,
      captionUrl: result.output?.captionUrl ?? post.captionUrl ?? null,
      captionMode: result.output?.captionMode ?? post.captionMode ?? 'none',
      outcomeReport: post.outcomeReport ?? null,
      postProduction: post,
    },
  };
}

export default execute;
