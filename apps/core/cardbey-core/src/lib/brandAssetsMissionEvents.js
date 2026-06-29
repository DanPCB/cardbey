/**
 * Post-draft brand assets checkpoint — blackboard + mission event emission.
 */
import { appendEvent } from './missionBlackboard.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   missionId: string;
 *   draftId?: string | null;
 *   artifacts?: string[];
 *   logoUrl?: string | null;
 *   heroVideoUrl?: string | null;
 *   posterUrl?: string | null;
 *   source?: string;
 * }} args
 */
export async function emitBrandAssetsUpdated(prisma, args) {
  const missionId = String(args.missionId ?? '').trim();
  if (!missionId) return { emitted: false, reason: 'missing_mission_id' };

  const artifacts = Array.isArray(args.artifacts) ? args.artifacts.filter(Boolean) : [];
  const posterUrl = args.posterUrl ?? null;
  const payload = {
    draftId: args.draftId ?? null,
    artifacts,
    logoUrl: args.logoUrl ?? null,
    heroVideoUrl: args.heroVideoUrl ?? null,
    posterUrl,
    generated_video_poster: posterUrl,
    source: args.source ?? 'brand_assets_checkpoint',
    heartbeatAt: new Date().toISOString(),
  };

  try {
    await appendEvent(missionId, 'brand_assets_updated', payload);
  } catch (err) {
    console.warn('[brandAssets] appendEvent failed:', err?.message ?? err);
  }

  try {
    await prisma.missionEvent.create({
      data: {
        missionId,
        type: 'brand_assets_updated',
        payload,
      },
    });
  } catch (err) {
    console.warn('[brandAssets] missionEvent create failed:', err?.message ?? err);
  }

  return { emitted: true, missionId, artifacts };
}

/**
 * @param {{ isVideo?: boolean; kind?: string; logoUrl?: string; heroVideoUrl?: string }} result
 */
export function brandAssetArtifactsFromUploadResult(result = {}) {
  const artifacts = [];
  if (result.logoUrl || result.kind === 'logo') artifacts.push('uploaded_logo');
  if (result.isVideo || result.heroVideoUrl || result.kind === 'hero_video') {
    artifacts.push('uploaded_hero_video');
    artifacts.push('generated_video_poster');
  }
  return artifacts;
}
