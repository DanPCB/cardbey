/**
 * Post-hero-upload notifications: mission checkpoint + SSE preview refresh.
 */
import {
  recordHeroArtifactCheckpoint,
  resolveMissionIdForHeroUpload,
} from '../../lib/artifactCheckpointAuthority.js';
import { broadcastMissionArtifact } from '../../realtime/simpleSse.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} args
 */
export async function emitHeroUploadSideEffects(prisma, args) {
  const draftId = typeof args.draftId === 'string' ? args.draftId.trim() : null;
  const generationRunId =
    typeof args.generationRunId === 'string' ? args.generationRunId.trim() : null;
  const storeId = typeof args.storeId === 'string' ? args.storeId.trim() : null;
  const heroImageUrl =
    typeof args.heroImageUrl === 'string' && args.heroImageUrl.trim() ? args.heroImageUrl.trim() : null;
  const heroVideoUrl =
    typeof args.heroVideoUrl === 'string' && args.heroVideoUrl.trim() ? args.heroVideoUrl.trim() : null;
  const heroMediaType = args.heroMediaType === 'video' ? 'video' : 'image';
  const explicitMissionId =
    typeof args.missionId === 'string' ? args.missionId.trim() : null;

  if (!draftId && !generationRunId && !storeId) {
    return { missionId: null, sseSent: false, checkpointRecorded: false };
  }

  let missionId = explicitMissionId;
  try {
    if (!missionId) {
      missionId = await resolveMissionIdForHeroUpload(prisma, {
        generationRunId,
        storeId,
        draftId,
      });
    }
  } catch (err) {
    console.warn('[heroUploadSideEffects] mission resolve failed (non-fatal):', err?.message || err);
  }

  let checkpointRecorded = false;
  if (missionId) {
    try {
      const rec = await recordHeroArtifactCheckpoint(prisma, {
        missionId,
        heroImageUrl,
        heroVideoUrl,
        heroMediaType,
      });
      checkpointRecorded = rec.recorded === true;
    } catch (err) {
      console.warn('[heroUploadSideEffects] checkpoint record failed (non-fatal):', err?.message || err);
    }

    try {
      broadcastMissionArtifact({
        missionId,
        subtype: 'draft_updated',
        payload: {
          draftId,
          generationRunId,
          reason: 'hero_upload',
          artifactType: 'hero',
          heroImageUrl,
          heroVideoUrl,
          heroMediaType,
          url: heroVideoUrl || heroImageUrl,
        },
      });
      return { missionId, sseSent: true, checkpointRecorded };
    } catch (err) {
      console.warn('[heroUploadSideEffects] SSE emit failed (non-fatal):', err?.message || err);
      return { missionId, sseSent: false, checkpointRecorded };
    }
  }

  return { missionId: null, sseSent: false, checkpointRecorded };
}
