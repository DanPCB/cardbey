/**
 * create_ghost_store — publish a community-captured ghost store from vision extraction.
 */

import { createGhostStore } from '../../ghostStore/ghostStoreService.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const extraction = input.extraction ?? input.ghostCandidate?.extraction ?? {};
  const location = input.location ?? input.ghostCandidate?.location ?? null;
  const visionEventId =
    input.visionEventId ?? input.eventId ?? input.ghostCandidate?.visionEventId ?? null;
  const imagePaths = Array.isArray(input.imagePaths)
    ? input.imagePaths
    : Array.isArray(input.ghostCandidate?.imagePaths)
      ? input.ghostCandidate.imagePaths
      : [];

  const route = await createGhostStore({
    extraction,
    location,
    visionEventId,
    imagePaths,
    userId: context.userId ?? input.userId ?? null,
    missionId: context.missionId ?? input.missionId ?? null,
  });

  return {
    status: route.action === 'unsupported' ? 'failed' : 'ok',
    output: route,
    error:
      route.action === 'unsupported'
        ? { message: route.message ?? 'Ghost store creation failed.' }
        : undefined,
  };
}
