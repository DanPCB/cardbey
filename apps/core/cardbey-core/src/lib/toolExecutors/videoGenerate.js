/**
 * Promotional video tool — truthful artifact lifecycle via universal contract.
 */

import { emitMissionArtifact } from '../artifacts/artifactSse.js';
import { registerGeneratedArtifactFromOperational } from '../artifacts/generatedArtifactAuthority.js';
import {
  VIDEO_ARTIFACT_UNAVAILABLE_MESSAGE,
  artifactFailed,
  artifactProcessing,
  artifactUnavailable,
  buildVideoArtifact,
  generateVideoViaProvider,
  isVideoGenerationProviderAvailable,
  resolveVideoProvider,
} from '../video/videoArtifactContract.js';
import { OpenAiVideoUnavailableError } from '../video/openaiVideoErrors.js';

function resolveMissionId(input = {}, context = {}) {
  return (
    (context?.missionId && String(context.missionId).trim()) ||
    (context?.activeMissionId && String(context.activeMissionId).trim()) ||
    (input?.missionId && String(input.missionId).trim()) ||
    null
  );
}

export async function execute(input = {}, context = {}) {
  const missionId = resolveMissionId(input, context);

  if (!missionId) {
    console.error('[VIDEO] No missionId — aborting artifact emit');
    return {
      status: 'failed',
      error: { code: 'MISSING_MISSION_ID', message: 'Active mission is required for video delivery.' },
      output: { message: 'Start or select a mission before generating a video.' },
    };
  }

  if (!isVideoGenerationProviderAvailable()) {
    const artifact = artifactUnavailable({
      type: 'video',
      missionId,
      sourceTool: 'video_generate_multimodal',
      title: 'Promotional video',
      message: VIDEO_ARTIFACT_UNAVAILABLE_MESSAGE,
      error: 'VIDEO_GENERATION_UNAVAILABLE',
    });
    emitMissionArtifact(missionId, artifact);
    return {
      status: 'failed',
      error: { code: 'VIDEO_GENERATION_UNAVAILABLE', message: VIDEO_ARTIFACT_UNAVAILABLE_MESSAGE },
      output: { artifact, message: VIDEO_ARTIFACT_UNAVAILABLE_MESSAGE, capabilityGap: true },
    };
  }

  const processingArtifact = artifactProcessing({
    type: 'video',
    missionId,
    sourceTool: 'video_generate_multimodal',
    title: 'Promotional video',
    message: 'Generating your promotional video…',
    provider: resolveVideoProvider(),
  });
  emitMissionArtifact(missionId, processingArtifact);

  try {
    const readyArtifact = await generateVideoViaProvider(input, context, {
      artifactId: processingArtifact.id,
      missionId,
      onProcessingUpdate: async (processingUpdate) => {
        const updated = buildVideoArtifact({
          ...processingUpdate,
          id: processingArtifact.id,
          missionId,
          sourceTool: 'video_generate_multimodal',
          title: 'Promotional video',
        });
        emitMissionArtifact(missionId, updated);
      },
    });
    const artifact = buildVideoArtifact({
      ...readyArtifact,
      id: processingArtifact.id,
      missionId,
      sourceTool: 'video_generate_multimodal',
    });
    emitMissionArtifact(missionId, artifact);
    const ownerUserId =
      (typeof context?.userId === 'string' && context.userId.trim()) ||
      (typeof context?.ownerUserId === 'string' && context.ownerUserId.trim()) ||
      '';
    if (ownerUserId) {
      await registerGeneratedArtifactFromOperational(artifact, {
        ownerUserId,
        source: 'video_generate_multimodal',
      }).catch((persistErr) => {
        console.warn('[VIDEO] generated artifact persist failed (non-fatal):', persistErr?.message);
      });
    }

    return {
      status: 'ok',
      output: {
        artifact,
        message: artifact.message ?? 'Your promotional video is ready.',
        videoUrl: artifact.url,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);

    if (err instanceof OpenAiVideoUnavailableError) {
      const artifact = artifactUnavailable({
        id: processingArtifact.id,
        type: 'video',
        missionId,
        sourceTool: 'video_generate_multimodal',
        title: 'Promotional video',
        message,
        error: err.code ?? 'OPENAI_VIDEO_UNAVAILABLE',
        provider: 'openai',
        metadata: { providerJobId: err.providerJobId },
      });
      emitMissionArtifact(missionId, artifact);
      return {
        status: 'failed',
        error: { code: err.code ?? 'OPENAI_VIDEO_UNAVAILABLE', message },
        output: { artifact, message, capabilityGap: true },
      };
    }

    const retryable = err?.retryable !== false;
    const artifact = artifactFailed({
      id: processingArtifact.id,
      type: 'video',
      missionId,
      sourceTool: 'video_generate_multimodal',
      title: 'Promotional video',
      message: retryable ? 'Video generation failed. You can try again.' : message,
      error: message,
      retryable,
      provider: 'openai',
      metadata: {
        providerJobId: err?.providerJobId ?? undefined,
      },
    });
    emitMissionArtifact(missionId, artifact);
    console.error('[VIDEO] generation failed', { missionId, artifactId: artifact.id, message });

    return {
      status: 'failed',
      error: { code: 'VIDEO_GENERATION_FAILED', message },
      output: { artifact, message },
    };
  }
}
