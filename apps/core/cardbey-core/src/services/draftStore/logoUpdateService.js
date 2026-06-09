/**
 * Unified business logo update for store + draft (Class A manual edit — no auto-republish).
 */
import { getDraft, patchDraftPreview } from './draftStoreService.js';
import { refreshPublishSnapshotFromCurrentPreview, isPublishSnapshotV1Enabled } from './publishSnapshotService.js';
import {
  assertHeroUpdateAccess,
  resolveDraftForHeroUpdate,
} from './heroUpdateService.js';

function trimStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

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

/**
 * True when preview carries an owner-uploaded logo that must not be replaced by generated avatars.
 * @param {object} [preview]
 */
export function hasUserUploadedLogo(preview) {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return false;
  const meta = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  if (meta.userUploadedLogo === true || meta.logoSource === 'checkpoint_upload') return true;
  const avatar = preview.avatar && typeof preview.avatar === 'object' ? preview.avatar : {};
  const avUrl =
    trimStr(avatar.imageUrl) ??
    trimStr(avatar.url) ??
    trimStr(preview.avatarImageUrl) ??
    trimStr(preview.avatarUrl) ??
    trimStr(preview.brand?.logoUrl);
  return avatar.source === 'upload' && !!avUrl;
}

/**
 * @param {string} logoUrl
 * @param {object} [existingPreview]
 */
export function buildLogoPreviewPatchFromUrl(logoUrl, existingPreview = {}) {
  const url = trimStr(logoUrl);
  if (!url) return {};

  const existingAvatar =
    existingPreview.avatar && typeof existingPreview.avatar === 'object'
      ? { ...existingPreview.avatar }
      : {};
  const existingBrand =
    existingPreview.brand && typeof existingPreview.brand === 'object'
      ? { ...existingPreview.brand }
      : {};
  const existingMeta =
    existingPreview.meta && typeof existingPreview.meta === 'object'
      ? { ...existingPreview.meta }
      : {};
  const existingStore =
    existingPreview.store && typeof existingPreview.store === 'object'
      ? { ...existingPreview.store }
      : {};

  return {
    avatarUrl: url,
    avatarImageUrl: url,
    avatar: {
      ...existingAvatar,
      type: 'image',
      source: 'upload',
      imageUrl: url,
      url,
    },
    brand: {
      ...existingBrand,
      logoUrl: url,
    },
    meta: {
      ...existingMeta,
      profileAvatarUrl: url,
      logo: url,
      userUploadedLogo: true,
      logoSource: 'checkpoint_upload',
    },
    store: {
      ...existingStore,
      profileAvatarUrl: url,
      avatarUrl: url,
      logo: url,
    },
  };
}

/**
 * Pipeline-internal logo apply (structured_store_build) — no owner access gate.
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {string} params.draftId
 * @param {string} params.logoUrl
 * @param {string|null} [params.storeId]
 */
export async function applyCheckpointLogoToDraft({ prisma, draftId, logoUrl, storeId = null }) {
  const url = trimStr(logoUrl);
  const effectiveDraftId = draftId ? String(draftId).trim() : null;
  if (!url || !effectiveDraftId) {
    return { ok: false, applied: false, reason: 'missing_draft_or_url' };
  }

  const fresh = await getDraft(effectiveDraftId);
  const existingPreview = parsePreviewBlob(fresh?.preview);
  const previewPatch = buildLogoPreviewPatchFromUrl(url, existingPreview);
  await patchDraftPreview(effectiveDraftId, previewPatch);

  let businessUpdated = false;
  const effectiveStoreId =
    (storeId && storeId !== 'temp' ? String(storeId).trim() : null) ||
    (fresh?.committedStoreId ? String(fresh.committedStoreId).trim() : null);
  if (effectiveStoreId) {
    businessUpdated = await syncBusinessLogoProfile(prisma, effectiveStoreId, url);
  }

  if (isPublishSnapshotV1Enabled()) {
    try {
      await refreshPublishSnapshotFromCurrentPreview(prisma, effectiveDraftId);
    } catch (snapErr) {
      console.warn('[logoUpdateService] checkpoint snapshot refresh failed (non-fatal):', snapErr?.message || snapErr);
    }
  }

  console.log('[store-build:logo-applied]', {
    draftId: effectiveDraftId,
    storeId: effectiveStoreId,
    logoUrl: url,
    businessUpdated,
  });

  return {
    ok: true,
    applied: true,
    draftId: effectiveDraftId,
    storeId: effectiveStoreId,
    logoUrl: url,
    businessUpdated,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {string} logoUrl
 */
export async function syncBusinessLogoProfile(prisma, businessId, logoUrl) {
  const url = trimStr(logoUrl);
  if (!url) return false;

  const existing = await prisma.business.findUnique({
    where: { id: businessId },
    select: { logo: true },
  });
  if (!existing) return false;

  let logoPayload = { url, avatarUrl: url };
  if (existing.logo) {
    try {
      const prev = typeof existing.logo === 'string' ? JSON.parse(existing.logo) : existing.logo;
      if (prev && typeof prev === 'object') {
        logoPayload = { ...prev, url, avatarUrl: url };
      }
    } catch {
      /* use fresh payload */
    }
  }

  await prisma.business.update({
    where: { id: businessId },
    data: {
      avatarImageUrl: url,
      logo: JSON.stringify(logoPayload),
      updatedAt: new Date(),
    },
  });
  return true;
}

/**
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {string} params.userId
 * @param {string|null} [params.storeId]
 * @param {string|null} [params.draftId]
 * @param {string|null} [params.generationRunId]
 * @param {string} params.logoUrl
 */
export async function updateLogoForStore({
  prisma,
  userId,
  storeId = null,
  draftId = null,
  generationRunId = null,
  logoUrl,
}) {
  const url = trimStr(logoUrl);
  if (!url) {
    const err = new Error('No logo URL to save');
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

  const tryPatchDraftLogo = async (draftIdToPatch) => {
    const fresh = await getDraft(draftIdToPatch);
    const existingPreview = parsePreviewBlob(fresh?.preview);
    const previewPatch = buildLogoPreviewPatchFromUrl(url, existingPreview);
    try {
      await patchDraftPreview(draftIdToPatch, previewPatch);
      draftUpdated = true;
      if (isPublishSnapshotV1Enabled()) {
        try {
          await refreshPublishSnapshotFromCurrentPreview(prisma, draftIdToPatch);
        } catch (snapErr) {
          console.warn('[logoUpdateService] publish snapshot refresh failed (non-fatal):', snapErr?.message || snapErr);
        }
      }
    } catch (draftErr) {
      console.warn('[logoUpdateService] draft logo patch failed (non-fatal):', draftErr?.message || draftErr);
    }
  };

  if (effectiveDraftId) {
    await tryPatchDraftLogo(effectiveDraftId);
  } else if (storeId && storeId !== 'temp') {
    const resolved = await resolveDraftForHeroUpdate(prisma, { storeId, draftId: null, generationRunId });
    if (resolved?.id) {
      await tryPatchDraftLogo(resolved.id);
    }
  }

  if (effectiveStoreId) {
    businessUpdated = await syncBusinessLogoProfile(prisma, effectiveStoreId, url);
  }

  return {
    ok: true,
    draftId: effectiveDraftId,
    storeId: effectiveStoreId,
    logoUrl: url,
    avatarImageUrl: url,
    draftUpdated,
    businessUpdated,
  };
}
