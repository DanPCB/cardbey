/**
 * Video artifact helpers — built on universal artifactContract.
 */

import {
  artifactFailed,
  artifactProcessing,
  artifactReady,
  artifactUnavailable,
  createArtifact,
} from '../artifacts/artifactContract.js';

export const VIDEO_ARTIFACT_UNAVAILABLE_MESSAGE =
  'Video generation is not connected yet. We can help with images, copy, and campaigns in the meantime.';

export function isVideoGenerationProviderAvailable() {
  const provider = String(process.env.VIDEO_GENERATION_PROVIDER ?? '').trim().toLowerCase();
  if (provider === 'mock') {
    return Boolean(String(process.env.VIDEO_ARTIFACT_MOCK_URL ?? '').trim());
  }
  if (provider === 'openai') {
    return Boolean(String(process.env.OPENAI_API_KEY ?? '').trim());
  }
  return false;
}

/**
 * @param {Partial<import('../artifacts/artifactContract.js').OperationalArtifact> & { status: import('../artifacts/artifactContract.js').ArtifactStatus }} fields
 */
export function buildVideoArtifact(fields) {
  return createArtifact({
    type: 'video',
    title: fields.title ?? 'Promotional video',
    ...fields,
  });
}

/**
 * @param {object} [input]
 * @param {object} [context]
 * @param {{
 *   artifactId?: string;
 *   missionId?: string;
 *   onProcessingUpdate?: (artifact: import('../artifacts/artifactContract.js').OperationalArtifact) => void | Promise<void>;
 * }} [options]
 */
export async function generateVideoViaProvider(input = {}, context = {}, options = {}) {
  const provider = String(process.env.VIDEO_GENERATION_PROVIDER ?? '').trim().toLowerCase();
  const missionId =
    options.missionId ||
    (context?.missionId && String(context.missionId).trim()) ||
    (input?.missionId && String(input.missionId).trim()) ||
    undefined;

  if (provider === 'mock') {
    const url = String(process.env.VIDEO_ARTIFACT_MOCK_URL ?? '').trim();
    if (!url) throw new Error('VIDEO_ARTIFACT_MOCK_URL is not set');
    return artifactReady({
      type: 'video',
      missionId,
      url,
      previewUrl: url,
      provider: 'mock',
      message: 'Video is ready to preview.',
    });
  }

  if (provider === 'openai') {
    const { openaiVideoEngine } = await import('../../ai/engines/openaiVideoEngine.js');
    const { OpenAiVideoUnavailableError } = await import('./openaiVideoErrors.js');

    const emitProcessing = async (info) => {
      if (!options.onProcessingUpdate) return;
      const progress =
        typeof info.progress === 'number' && Number.isFinite(info.progress)
          ? Math.round(info.progress)
          : null;
      const msg =
        info.status === 'queued'
          ? 'Video job queued with OpenAI…'
          : progress != null
            ? `Generating your promotional video… ${progress}%`
            : 'Generating your promotional video…';
      await options.onProcessingUpdate(
        artifactProcessing({
          id: options.artifactId,
          type: 'video',
          missionId,
          provider: 'openai',
          message: msg,
          metadata: {
            providerJobId: info.providerJobId,
            openaiStatus: info.status,
            progress: info.progress,
          },
        }),
      );
    };

    try {
      const result = await openaiVideoEngine.generateVideo(
        {
          prompt:
            (typeof input?.prompt === 'string' && input.prompt.trim()) ||
            (typeof input?.description === 'string' && input.description.trim()) ||
            'Promotional video for store',
          lengthSeconds:
            typeof input?.lengthSeconds === 'number'
              ? input.lengthSeconds
              : Number(process.env.OPENAI_VIDEO_SECONDS) || 8,
          style: typeof input?.style === 'string' ? input.style : undefined,
          storeId:
            (typeof input?.storeId === 'string' && input.storeId.trim()) ||
            (typeof context?.storeId === 'string' && context.storeId.trim()) ||
            undefined,
          aspectRatio: typeof input?.aspectRatio === 'string' ? input.aspectRatio : undefined,
        },
        {
          onJobCreated: emitProcessing,
          onPoll: emitProcessing,
        },
      );

      const videoUrl = typeof result?.videoUrl === 'string' ? result.videoUrl.trim() : '';
      if (!videoUrl) throw new Error('Video provider returned no URL');

      return artifactReady({
        id: options.artifactId,
        type: 'video',
        missionId,
        url: videoUrl,
        previewUrl: videoUrl,
        thumbnailUrl: result?.thumbnailUrl ?? null,
        provider: 'openai',
        message: 'Your promotional video is ready.',
        metadata: {
          providerJobId: result?.providerJobId,
          ...(result?.raw && typeof result.raw === 'object' ? result.raw : {}),
        },
      });
    } catch (err) {
      if (err instanceof OpenAiVideoUnavailableError) throw err;
      throw err;
    }
  }

  throw new Error(`Unknown VIDEO_GENERATION_PROVIDER: ${provider || '(unset)'}`);
}

export { artifactProcessing, artifactFailed, artifactUnavailable, artifactReady };
