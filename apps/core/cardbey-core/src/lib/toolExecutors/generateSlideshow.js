/**
 * Slideshow tool — truthful artifact lifecycle (no fake ok + null URL).
 */

import { emitMissionArtifact } from '../artifacts/artifactSse.js';
import { registerGeneratedArtifactFromOperational } from '../artifacts/generatedArtifactAuthority.js';
import {
  SLIDESHOW_UNAVAILABLE_MESSAGE,
  generateSlideshowViaProvider,
  isSlideshowGenerationProviderAvailable,
  slideshowFailed,
  slideshowProcessing,
  slideshowUnavailable,
} from '../artifacts/slideshowArtifactContract.js';

function resolveMissionId(input = {}, context = {}) {
  return (
    (context?.missionId && String(context.missionId).trim()) ||
    (context?.activeMissionId && String(context.activeMissionId).trim()) ||
    (input?.missionId && String(input.missionId).trim()) ||
    null
  );
}

/**
 * @param {import('../artifacts/artifactContract.js').OperationalArtifact} artifact
 * @param {string} missionId
 */
function emit(artifact, missionId) {
  emitMissionArtifact(missionId, artifact);
}

export async function execute(input = {}, context = {}) {
  const missionId = resolveMissionId(input, context);

  if (!missionId) {
    console.error('[SLIDESHOW] No missionId — aborting artifact emit');
    return {
      status: 'failed',
      error: { code: 'MISSING_MISSION_ID', message: 'Active mission is required for slideshow delivery.' },
      output: { message: 'Start or select a mission before creating a slideshow.' },
    };
  }

  if (!isSlideshowGenerationProviderAvailable()) {
    const artifact = slideshowUnavailable({
      type: 'slideshow',
      missionId,
      sourceTool: 'generate_slideshow',
      title: 'Slideshow',
      message: SLIDESHOW_UNAVAILABLE_MESSAGE,
      error: 'SLIDESHOW_GENERATION_UNAVAILABLE',
      metadata: { clientExportSupported: true },
    });
    emit(artifact, missionId);
    return {
      status: 'failed',
      error: {
        code: 'SLIDESHOW_GENERATION_UNAVAILABLE',
        message: SLIDESHOW_UNAVAILABLE_MESSAGE,
      },
      output: {
        artifact,
        message: SLIDESHOW_UNAVAILABLE_MESSAGE,
        capabilityGap: true,
      },
    };
  }

  const processingArtifact = slideshowProcessing({
    type: 'slideshow',
    missionId,
    sourceTool: 'generate_slideshow',
    title: 'Slideshow',
    message: 'Generating your slideshow…',
    provider: String(process.env.SLIDESHOW_GENERATION_PROVIDER ?? '').trim() || null,
    metadata: { promotionId: input?.promotionId ?? null },
  });
  emit(processingArtifact, missionId);

  try {
    const readyArtifact = await generateSlideshowViaProvider(input, context);
    const artifact = {
      ...readyArtifact,
      id: processingArtifact.id,
      missionId,
      sourceTool: 'generate_slideshow',
    };
    emit(artifact, missionId);
    const ownerUserId =
      (typeof context?.userId === 'string' && context.userId.trim()) ||
      (typeof context?.ownerUserId === 'string' && context.ownerUserId.trim()) ||
      '';
    if (ownerUserId) {
      await registerGeneratedArtifactFromOperational(artifact, {
        ownerUserId,
        source: 'generate_slideshow',
      }).catch((persistErr) => {
        console.warn('[SLIDESHOW] generated artifact persist failed (non-fatal):', persistErr?.message);
      });
    }
    return {
      status: 'ok',
      output: {
        artifact,
        message: artifact.message ?? 'Your slideshow is ready.',
        slideshowUrl: artifact.url ?? artifact.previewUrl,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    const artifact = slideshowFailed({
      id: processingArtifact.id,
      type: 'slideshow',
      missionId,
      sourceTool: 'generate_slideshow',
      title: 'Slideshow',
      message: 'Slideshow generation failed.',
      error: message,
    });
    emit(artifact, missionId);
    return {
      status: 'failed',
      error: { code: 'SLIDESHOW_GENERATION_FAILED', message },
      output: { artifact, message },
    };
  }
}
