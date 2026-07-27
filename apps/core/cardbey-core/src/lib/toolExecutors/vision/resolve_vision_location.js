/**
 * resolve_vision_location — EXIF → client GPS → needsLocation.
 */

import { resolveVisionLocation } from '../../vision/locationResolver.js';

/**
 * @param {object} [input]
 * @param {Array<Buffer|{ buffer?: Buffer }>} [input.imageBuffers]
 * @param {object|null} [input.clientLocation]
 */
export async function execute(input = {}) {
  const result = await resolveVisionLocation({
    imageBuffers: input.imageBuffers ?? [],
    clientLocation: input.clientLocation ?? null,
  });
  return {
    status: 'ok',
    output: result,
  };
}
