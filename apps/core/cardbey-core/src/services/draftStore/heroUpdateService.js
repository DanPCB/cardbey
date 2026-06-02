/**
 * Unified hero update for store + draft (Class A manual edit — no mission, no auto-republish).
 */
import { resolveDraftForStore } from '../../lib/draftResolver.js';
import { canAccessDraftStore } from '../../lib/draftOwnership.js';
import { getDraft, patchDraftPreview } from './draftStoreService.js';
import {
  readCanonicalHeroFromPreview,
  writeCanonicalHeroMediaToPreview,
  getExistingVideoUrlFromPreview,
  isAllowedToReplaceVideoWithImage,
} from './draftPreviewHeroSync.js';
import { refreshPublishSnapshotFromCurrentPreview, isPublishSnapshotV1Enabled } from './publishSnapshotService.js';
import { getPublishedBusinessArtifact } from '../publishedArtifactProjection/getPublishedBusinessArtifact.js';

function parsePreviewBlob(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? { ...o } : {};
    } catch {
      return {};
    }
  }
  return {};
}

function parseStylePreferencesBlob(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? { ...o } : {};
    } catch {
      return {};
    }
  }
  return {};
}

function trimStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function normUrl(v) {
  const s = trimStr(v);
  return s ? s.replace(/\/$/, '') : null;
}

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|#|$)/i;

/** @param {object} written - preview after writeCanonicalHeroMediaToPreview */
function heroPatchFromCanonicalPreview(written) {
  const patch = {};
  if (written.hero && typeof written.hero === 'object') patch.hero = { ...written.hero };
  if (written.heroMediaType !== undefined) patch.heroMediaType = written.heroMediaType;
  if (written.heroVideoUrl !== undefined) patch.heroVideoUrl = written.heroVideoUrl;
  if (written.heroVideo !== undefined) patch.heroVideo = written.heroVideo;
  if (written.heroPosterUrl !== undefined) patch.heroPosterUrl = written.heroPosterUrl;
  if (written.heroPoster !== undefined) patch.heroPoster = written.heroPoster;
  if (written.heroImageUrl !== undefined) patch.heroImageUrl = written.heroImageUrl;
  return patch;
}

/**
 * Build preview patch object (hero, heroImageUrl, heroVideo, heroMediaType) from URLs.
 * All hero fields are written via writeCanonicalHeroMediaToPreview (canonical boundary).
 *
 * @param {object} opts
 * @param {string|null} [opts.imageUrl]
 * @param {string|null} [opts.videoUrl]
 * @param {string|null} [opts.source]
 * @param {object} [opts.existingPreview]
 * @param {boolean} [opts.allowReplaceVideoWithImage]
 * @param {string} [opts.heroWriteIntent] - image_upload | image_select | replace_video_with_image
 */
export function buildHeroPreviewPatchFromUrls({
  imageUrl = null,
  videoUrl = null,
  source = null,
  existingPreview = {},
  allowReplaceVideoWithImage = false,
  heroWriteIntent,
}) {
  const isVideoHero =
    Boolean(videoUrl) || (imageUrl && VIDEO_EXT.test(imageUrl));

  if (!isVideoHero && imageUrl == null) return {};

  const existingVideo = getExistingVideoUrlFromPreview(existingPreview);
  if (!isVideoHero && imageUrl != null && existingVideo) {
    const intent =
      heroWriteIntent ??
      (source === 'upload' ? 'image_upload' : source === 'draft' ? 'image_select' : undefined);
    if (
      !isAllowedToReplaceVideoWithImage({
        allowReplaceVideoWithImage,
        heroWriteIntent: intent,
      })
    ) {
      return {};
    }
  }

  let canonical;
  if (isVideoHero) {
    const vid = videoUrl || imageUrl;
    const poster =
      imageUrl && imageUrl !== vid && !VIDEO_EXT.test(imageUrl) ? imageUrl : null;
    canonical = { mediaType: 'video', imageUrl: null, videoUrl: vid, posterUrl: poster };
  } else {
    canonical = { mediaType: 'image', imageUrl, videoUrl: null, posterUrl: null };
  }

  const temp =
    existingPreview && typeof existingPreview === 'object'
      ? JSON.parse(JSON.stringify(existingPreview))
      : {};
  writeCanonicalHeroMediaToPreview(temp, canonical);

  if (canonical.mediaType === 'video' && !canonical.posterUrl) {
    temp.heroImageUrl = null;
    if (temp.hero && typeof temp.hero === 'object') {
      delete temp.hero.imageUrl;
    }
  }

  if (source != null && temp.hero && typeof temp.hero === 'object') {
    temp.hero.source = source;
  } else if (source != null) {
    temp.hero = { ...(temp.hero || {}), source };
  }

  if (canonical.mediaType === 'video' && temp.hero && typeof temp.hero === 'object') {
    temp.hero.autoplay = temp.hero.autoplay !== false;
    temp.hero.muted = temp.hero.muted !== false;
    temp.hero.loop = temp.hero.loop !== false;
  }

  return heroPatchFromCanonicalPreview(temp);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ storeId?: string|null, draftId?: string|null, generationRunId?: string|null }} opts
 */
export async function resolveDraftForHeroUpdate(prisma, { storeId, draftId, generationRunId = null }) {
  if (draftId) {
    return prisma.draftStore.findUnique({ where: { id: String(draftId).trim() } });
  }
  if (storeId && storeId !== 'temp') {
    const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
    return resolved.draft ?? null;
  }
  if (storeId === 'temp' && generationRunId) {
    const resolved = await resolveDraftForStore(prisma, 'temp', generationRunId);
    return resolved.draft ?? null;
  }
  return null;
}

/**
 * Sync Business.heroImageUrl (+ stylePreferences hero video) for profile/dashboard.
 * Does not apply published projection to live /s/:slug.
 */
export async function syncBusinessHeroProfile(prisma, businessId, mergedPreview) {
  const existing = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stylePreferences: true, publishedAt: true, isActive: true },
  });
  if (!existing) return false;

  const isLivePublished = existing.publishedAt != null && existing.isActive === true;
  if (isLivePublished) {
    return false;
  }

  const { heroImage, heroVideo, isVideo } = readCanonicalHeroFromPreview(mergedPreview);
  const profileHeroUrl = heroImage || heroVideo || null;
  if (!profileHeroUrl) return false;

  const prefs = parseStylePreferencesBlob(existing.stylePreferences);
  const stylePreferences = { ...prefs };
  if (profileHeroUrl) stylePreferences.heroImage = profileHeroUrl;
  if (heroVideo) stylePreferences.heroVideo = heroVideo;
  else if (!isVideo) delete stylePreferences.heroVideo;

  await prisma.business.update({
    where: { id: businessId },
    data: {
      heroImageUrl: profileHeroUrl,
      stylePreferences,
      updatedAt: new Date(),
    },
  });
  return true;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {{ storeId?: string|null, draftId?: string|null, generationRunId?: string|null }} scope
 */
/** Shared access gate for store hero/logo multipart uploads. */
export async function assertHeroUpdateAccess(prisma, userId, { storeId, draftId, generationRunId }) {
  const draft = await resolveDraftForHeroUpdate(prisma, { storeId, draftId, generationRunId });
  if (draft) {
    const allowed = await canAccessDraftStore(draft, { userId, tenantKey: userId });
    if (!allowed) {
      const err = new Error('You do not have access to this draft.');
      err.statusCode = 403;
      throw err;
    }
  }
  const bizId = storeId && storeId !== 'temp' ? storeId : draft?.committedStoreId;
  if (bizId) {
    const business = await prisma.business.findUnique({
      where: { id: bizId },
      select: { userId: true },
    });
    if (!business) {
      const err = new Error('Store not found');
      err.statusCode = 404;
      throw err;
    }
    if (business.userId !== userId) {
      const err = new Error('You do not have permission to update this store.');
      err.statusCode = 403;
      throw err;
    }
  }
  return draft;
}

/**
 * Unified hero write: draft preview + business profile row (never auto-republish live projection).
 *
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {string} params.userId
 * @param {string|null} [params.storeId]
 * @param {string|null} [params.draftId]
 * @param {string|null} [params.generationRunId]
 * @param {object} params.previewPatch - patch for patchDraftPreview (hero, heroImageUrl, …)
 * @param {string} [params.source]
 */
export async function updateHeroForStore({
  prisma,
  userId,
  storeId = null,
  draftId = null,
  generationRunId = null,
  previewPatch,
  source = 'upload',
}) {
  if (!previewPatch || typeof previewPatch !== 'object' || !Object.keys(previewPatch).length) {
    const err = new Error('No hero fields to save');
    err.statusCode = 400;
    throw err;
  }

  const draft = await assertHeroUpdateAccess(prisma, userId, { storeId, draftId, generationRunId });
  const effectiveDraftId = draft?.id ?? (draftId ? String(draftId).trim() : null);
  const effectiveStoreId =
    (storeId && storeId !== 'temp' ? String(storeId).trim() : null) ||
    (draft?.committedStoreId ? String(draft.committedStoreId).trim() : null);

  let draftUpdated = false;
  let businessUpdated = false;
  let mergedPreview = previewPatch;

  if (effectiveDraftId) {
    if (previewPatch.hero?.source == null && source) {
      previewPatch.hero = { ...(previewPatch.hero || {}), source };
    }
    const allowReplaceVideoWithImage =
      previewPatch.heroMediaType === 'image' ||
      previewPatch.hero?.type === 'image' ||
      (previewPatch.heroImageUrl != null &&
        previewPatch.heroVideoUrl == null &&
        previewPatch.heroVideo == null &&
        !previewPatch.hero?.videoUrl);
    const heroWriteIntent =
      source === 'upload'
        ? previewPatch.heroMediaType === 'video' || previewPatch.hero?.type === 'video'
          ? 'video_upload'
          : 'image_upload'
        : source === 'draft'
          ? 'image_select'
          : undefined;
    await patchDraftPreview(effectiveDraftId, previewPatch, {
      allowReplaceVideoWithImage,
      heroWriteIntent,
      writer: 'updateHeroForStore',
      storeId: effectiveStoreId,
    });
    draftUpdated = true;
    const fresh = await getDraft(effectiveDraftId);
    mergedPreview = parsePreviewBlob(fresh?.preview);
    if (isPublishSnapshotV1Enabled()) {
      try {
        await refreshPublishSnapshotFromCurrentPreview(prisma, effectiveDraftId);
      } catch (snapErr) {
        console.warn('[heroUpdateService] publish snapshot refresh failed (non-fatal):', snapErr?.message || snapErr);
      }
    }
  }

  if (effectiveStoreId) {
    businessUpdated = await syncBusinessHeroProfile(prisma, effectiveStoreId, mergedPreview);
  }

  const { heroImage, heroVideo, isVideo } = readCanonicalHeroFromPreview(mergedPreview);
  const posterOnly =
    heroImage && heroVideo && heroImage !== heroVideo && !/\.(mp4|webm|mov)(\?|#|$)/i.test(heroImage)
      ? heroImage
      : null;
  const heroImageUrl = isVideo ? posterOnly : heroImage || heroVideo || null;
  const heroVideoUrl = isVideo ? heroVideo || null : null;

  return {
    ok: true,
    draftId: effectiveDraftId,
    storeId: effectiveStoreId,
    heroImageUrl,
    heroVideoUrl,
    heroMediaType: isVideo ? 'video' : 'image',
    draftUpdated,
    businessUpdated,
    source,
  };
}

/**
 * Read canonical hero URLs for sync UI.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {string} userId
 */
export async function getHeroSyncStateForStore(prisma, storeId, userId) {
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: { userId: true, heroImageUrl: true, stylePreferences: true, publishedAt: true, isActive: true },
  });
  if (!business) {
    const err = new Error('Store not found');
    err.statusCode = 404;
    throw err;
  }
  if (business.userId !== userId) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const resolved = await resolveDraftForStore(prisma, storeId, null);
  const draft = resolved.draft;
  const draftPreview = draft ? parsePreviewBlob(draft.preview) : {};
  const { heroImage, heroVideo, isVideo } = readCanonicalHeroFromPreview(draftPreview);
  const draftHeroUrl = isVideo && heroVideo ? heroVideo : heroImage;

  const prefs = parseStylePreferencesBlob(business.stylePreferences);
  const businessHeroUrl =
    trimStr(business.heroImageUrl) || trimStr(prefs.heroImage) || null;
  const businessVideoUrl = trimStr(prefs.heroVideo) || null;

  let liveHeroUrl = null;
  try {
    const { projection } = await getPublishedBusinessArtifact(prisma, { businessId: storeId });
    liveHeroUrl = trimStr(projection?.heroUrl) || null;
  } catch {
    liveHeroUrl = null;
  }

  const isLive = business.publishedAt != null && business.isActive === true;
  const draftNorm = normUrl(draftHeroUrl);
  const businessCanonical =
    isVideo && businessVideoUrl ? businessVideoUrl : businessHeroUrl;
  const businessNorm = normUrl(businessCanonical);
  const liveNorm = normUrl(liveHeroUrl);
  const draftBusinessInSync = !draftNorm || !businessNorm || draftNorm === businessNorm;
  const draftLiveInSync = !isLive || !draftNorm || !liveNorm || draftNorm === liveNorm;
  const inSync = draftBusinessInSync && draftLiveInSync;
  const hasUnpublishedHeroChanges =
    isLive && Boolean(draftNorm) && (liveNorm == null || draftNorm !== liveNorm);

  return {
    ok: true,
    storeId,
    draftId: draft?.id ?? null,
    draftHeroUrl,
    businessHeroUrl,
    businessVideoUrl,
    businessCanonical,
    liveHeroUrl,
    heroMediaType: isVideo ? 'video' : 'image',
    isLive,
    inSync,
    hasUnpublishedHeroChanges,
  };
}
