/**
 * Slideshow artifact provider checks and generation seam.
 */

import {
  artifactFailed,
  artifactProcessing,
  artifactReady,
  artifactUnavailable,
  createArtifact,
} from './artifactContract.js';

export const SLIDESHOW_UNAVAILABLE_MESSAGE =
  'Slideshow generation is not connected on the server yet. Build and export a slideshow from Content Studio in Performer when you are ready.';

export function isSlideshowGenerationProviderAvailable() {
  const provider = String(process.env.SLIDESHOW_GENERATION_PROVIDER ?? '').trim().toLowerCase();
  if (provider === 'mock') {
    return Boolean(String(process.env.SLIDESHOW_ARTIFACT_MOCK_URL ?? '').trim());
  }
  if (provider === 'server') {
    return false;
  }
  return false;
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function generateSlideshowViaProvider(input = {}, context = {}) {
  const provider = String(process.env.SLIDESHOW_GENERATION_PROVIDER ?? '').trim().toLowerCase();
  const missionId =
    (context?.missionId && String(context.missionId).trim()) ||
    (input?.missionId && String(input.missionId).trim()) ||
    undefined;

  if (provider === 'mock') {
    const url = String(process.env.SLIDESHOW_ARTIFACT_MOCK_URL ?? '').trim();
    if (!url) throw new Error('SLIDESHOW_ARTIFACT_MOCK_URL is not set');
    return artifactReady({
      type: 'slideshow',
      missionId,
      sourceTool: 'generate_slideshow',
      title: 'Store slideshow',
      url,
      previewUrl: url,
      provider: 'mock',
      message: 'Slideshow is ready to preview.',
      metadata: { promotionId: input?.promotionId ?? null },
    });
  }

  throw new Error(`Unknown SLIDESHOW_GENERATION_PROVIDER: ${provider || '(unset)'}`);
}

export {
  artifactUnavailable as slideshowUnavailable,
  artifactProcessing as slideshowProcessing,
  artifactFailed as slideshowFailed,
  createArtifact,
};
