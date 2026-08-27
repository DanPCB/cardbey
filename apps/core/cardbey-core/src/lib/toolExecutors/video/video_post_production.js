/**
 * video_post_production — Factory/skill stage: narration TTS, music mux, captions.
 */

import { runVideoPostProduction } from '../../video/postProduction/videoPostProductionService.js';

export async function execute(input = {}) {
  const result = await runVideoPostProduction(input);
  const output = result.output ?? {};
  const executeArtifact = output.videoOutput?.artifact;
  const artifact =
    executeArtifact && typeof executeArtifact === 'object'
      ? {
          ...executeArtifact,
          url: output.videoUrl ?? executeArtifact.url,
          previewUrl: output.videoUrl ?? executeArtifact.previewUrl,
          metadata: {
            ...(executeArtifact.metadata && typeof executeArtifact.metadata === 'object'
              ? executeArtifact.metadata
              : {}),
            hasAudio: output.hasAudio === true,
            captionUrl: output.captionUrl ?? null,
            captionMode: output.captionMode ?? 'none',
            audioSource: output.audioSource ?? null,
            language: output.language ?? null,
            outcome: result.outcome ?? null,
            outcomeReport: output.outcomeReport ?? null,
          },
        }
      : undefined;

  if (!result.ok || result.status === 'failed') {
    return {
      status: 'failed',
      error: result.error ?? {
        code: result.code ?? 'VIDEO_POST_PRODUCTION_FAILED',
        message: 'Video post-production failed',
      },
      output: { ...output, artifact },
    };
  }

  return {
    status: 'ok',
    output: {
      ...output,
      artifact,
      videoUrl: output.videoUrl,
      captionUrl: output.captionUrl ?? null,
      hasAudio: output.hasAudio === true,
      outcome: result.outcome,
    },
  };
}

export default execute;
