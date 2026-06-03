/**
 * Unified hero update for store + draft (Class A manual edit — no mission, no auto-republish).
 */
import { resolveDraftForStore } from '../../lib/draftResolver.js';
import { canAccessDraftStore } from '../../lib/draftOwnership.js';
import { getDraft, patchDraftPreview, isCommittedHeroAvatarPreviewPatch } from './draftStoreService.js';
import { readCanonicalHeroFromPreview } from './draftPreviewHeroSync.js';
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

/**
 * Build preview patch object (hero, heroImageUrl, heroVideo, heroMediaType) from URLs.
 * @param {object} opts
 * @param {string|null} [opts.imageUrl]
 * @param {string|null} [opts.videoUrl]
 * @param {string|null} [opts.source]
 * @param {object} [opts.existingPreview]
 */
export function buildHeroPreviewPatchFromUrls({
  imageUrl = null,
  videoUrl = null,
  source = null,
  existingPreview = {},
}) {
  const existingHero =
    existingPreview.hero && typeof existingPreview.hero === 'object'
      ? { ...existingPreview.hero }
      : {};
  const isVideoHero =
    Boolean(videoUrl) || (imageUrl && /\.(mp4|webm|mov)(\?|#|$)/i.test(imageUrl));
  const hero = { ...existingHero };

  if (isVideoHero) {
    const vid = videoUrl || imageUrl;
    hero.type = 'video';
    hero.videoUrl = vid;
    hero.url = vid;
    hero.autoplay = hero.autoplay !== false;
    hero.muted = hero.muted !== false;
    hero.loop = hero.loop !== false;
    const poster =
      imageUrl && imageUrl !== vid && !/\.(mp4|webm|mov)(\?|#|$)/i.test(imageUrl) ? imageUrl : null;
    if (poster) hero.imageUrl = poster;
    else delete hero.imageUrl;
  } else if (imageUrl != null) {
    hero.type = 'image';
    hero.imageUrl = imageUrl;
    hero.url = imageUrl;
    hero.videoUrl = null;
  }
  if (source != null) hero.source = source;

  const patch = {};
  if (Object.keys(hero).length) patch.hero = hero;
  if (isVideoHero) {
    const vid = videoUrl || imageUrl;
    if (vid) {
      patch.heroVideo = vid;
      patch.heroImageUrl = hero.imageUrl || vid;
      patch.heroMediaType = 'video';
      patch.heroImage = null;
    }
  } else if (imageUrl != null) {
    patch.heroImageUrl = imageUrl;
    patch.heroVideo = null;
    patch.heroMediaType = 'image';
  }
  return patch;
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
async function assertHeroUpdateAccess(prisma, userId, { storeId, draftId, generationRunId }) {
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
    const draftRow = draft ?? (await getDraft(effectiveDraftId));
    if (draftRow?.status === 'committed' && !isCommittedHeroAvatarPreviewPatch(previewPatch)) {
      const err = new Error(
        `Draft ${effectiveDraftId} has already been committed; only hero/avatar media can be updated`,
      );
      err.statusCode = 409;
      throw err;
    }
    await patchDraftPreview(effectiveDraftId, previewPatch);
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
  const heroImageUrl = heroImage || heroVideo || null;
  const heroVideoUrl = isVideo ? heroVideo : null;

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
