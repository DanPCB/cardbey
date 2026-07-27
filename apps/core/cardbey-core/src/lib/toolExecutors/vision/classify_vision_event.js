/**
 * classify_vision_event — QR fast path or Claude vision intent classification.
 */

import { classifyVisionIntent } from '../../vision/visionIntentClassifier.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const result = await classifyVisionIntent({
    decodedPayload: input.decodedPayload ?? null,
    surface: input.surface ?? 'unknown',
    defaultIntentHint: input.defaultIntentHint ?? null,
    imagePaths: input.imagePaths ?? [],
    imageBuffers: input.imageBuffers ?? [],
  });
  return {
    status: 'ok',
    output: result,
  };
}
