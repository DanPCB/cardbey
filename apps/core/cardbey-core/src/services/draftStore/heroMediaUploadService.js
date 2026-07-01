/**
 * Shared hero media upload + draft persist (stores route + runtime ui-action upload).
 */

import multer from 'multer';
import { getPrismaClient, prisma } from '../../lib/prisma.js';
import { resolveDraftForStore } from '../../lib/draftResolver.js';
import { getDraftByGenerationRunId, getDraft } from './draftStoreService.js';
import { isDraftOwnedByUser } from '../../lib/draftOwnership.js';
import {
  buildHeroPreviewPatchFromUrls,
  updateHeroForStore,
} from './heroUpdateService.js';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { ensureWebCompatibleVideoBuffer, videoUploadMaxTranscodeBytes, videoUploadSkipTranscodeEnabled } from '../../lib/videoCompat.js';
import { VIDEO_UPLOAD_MAX_BYTES, VIDEO_UPLOAD_MAX_MB } from '../../constants/videoUploadLimits.js';
import {
  buildStorageUploadResponse,
  resolveClientHeroMediaUrl,
  resolvePersistedHeroMediaUrl,
} from '../../lib/storage/uploadResponse.js';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const ALLOWED_HERO_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const ALLOWED_HERO_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_HERO_VIDEO_MIMES];

const heroMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype ? String(file.mimetype).toLowerCase() : '';
    if (mime && ALLOWED_HERO_MIMES.includes(mime)) {
      cb(null, true);
    } else {
      cb(
        new Error('Unsupported file type. Use JPG, PNG, WebP, GIF, SVG, MP4, WebM, or MOV.'),
        false,
      );
    }
  },
});

/** Multer middleware for hero upload routes (field name: file). */
export function heroMediaUploadSingle(req, res, next) {
  heroMediaUpload.single('file')(req, res, (err) => {
    if (err) {
      const isLimit = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        ok: false,
        error: isLimit ? 'file_too_large' : 'invalid_file',
        message: isLimit ? `File must be ${VIDEO_UPLOAD_MAX_MB}MB or smaller.` : err.message || 'Invalid or missing file',
      });
    }
    next();
  });
}

/**
 * Resolve draft for hero upload (store-scoped or explicit draftId).
 *
 * @param {{
 *   storeId: string;
 *   draftId?: string|null;
 *   generationRunId?: string|null;
 *   userId: string;
 *   userRole?: string|null;
 * }} input
 */
export async function resolveDraftForHeroUpload(input) {
  const storeId = typeof input.storeId === 'string' ? input.storeId.trim() : '';
  const explicitDraftId =
    (typeof input.draftId === 'string' ? input.draftId.trim() : null) || null;
  const generationRunId =
    (typeof input.generationRunId === 'string' ? input.generationRunId.trim() : null) || null;
  const userId = input.userId;

  if (!userId) {
    return { errorResponse: { status: 401, body: { ok: false, error: 'unauthorized', message: 'Authentication required' } } };
  }
  if (!storeId && !explicitDraftId) {
    return {
      errorResponse: {
        status: 400,
        body: { ok: false, error: 'store_id_required', message: 'storeId or draftId is required' },
      },
    };
  }

  if (explicitDraftId) {
    const draft = await getDraft(explicitDraftId);
    if (!draft) {
      return { errorResponse: { status: 404, body: { ok: false, error: 'draft_not_found', message: 'Draft not found' } } };
    }
    const { canAccessDraftStore } = await import('../../lib/draftOwnership.js');
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey: userId,
      isSuperAdmin: input.userRole === 'super_admin',
    });
    if (!allowed) {
      return { errorResponse: { status: 403, body: { ok: false, error: 'forbidden', message: 'You do not have access to this draft.' } } };
    }
    return { draft, storeId: storeId || draft.committedStoreId || 'temp' };
  }

  if (storeId === 'temp') {
    if (!generationRunId) {
      return {
        errorResponse: {
          status: 400,
          body: { ok: false, error: 'generationRunId_required', message: 'Query generationRunId required when storeId is temp' },
        },
      };
    }
    const allowed = await isDraftOwnedByUser(generationRunId, userId);
    if (!allowed) {
      return { errorResponse: { status: 403, body: { ok: false, error: 'forbidden', message: 'You do not have access to this draft.' } } };
    }
    const draft = await getDraftByGenerationRunId(generationRunId);
    if (!draft) {
      return { errorResponse: { status: 404, body: { ok: false, error: 'draft_not_found', message: 'Draft not found' } } };
    }
    return { draft, storeId: 'temp' };
  }

  const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
  if (!resolved.draft) {
    const business = await prisma.business.findUnique({ where: { id: storeId }, select: { userId: true } });
    if (!business) {
      return { errorResponse: { status: 404, body: { ok: false, error: 'store_not_found', message: 'Store not found' } } };
    }
    if (business.userId !== userId) {
      return { errorResponse: { status: 403, body: { ok: false, error: 'forbidden', message: 'You do not have access to this store.' } } };
    }
    return { draft: null, storeId };
  }
  const business = await prisma.business.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!business || business.userId !== userId) {
    return { errorResponse: { status: 403, body: { ok: false, error: 'forbidden', message: 'You do not have access to this store.' } } };
  }
  return { draft: resolved.draft, storeId };
}

/**
 * Upload hero file to storage and persist to draft preview.
 *
 * @param {{
 *   userId: string;
 *   storeId: string;
 *   draft: object|null;
 *   file: { buffer: Buffer; mimetype?: string; originalname?: string };
 *   generationRunId?: string|null;
 *   missionId?: string|null;
 *   req?: import('express').Request;
 *   prismaClient?: import('@prisma/client').PrismaClient;
 * }} input
 */
export async function executeStoreHeroMediaUpload(input) {
  const db = input.prismaClient ?? getPrismaClient();
  const { userId, storeId, draft, file, req } = input;
  const generationRunId =
    (typeof input.generationRunId === 'string' ? input.generationRunId.trim() : null) || null;
  const missionId = (typeof input.missionId === 'string' ? input.missionId.trim() : null) || null;

  if (!file?.buffer) {
    const err = new Error('No file uploaded; use multipart field "file".');
    err.code = 'no_file';
    err.statusCode = 400;
    throw err;
  }

  let buffer = file.buffer;
  let mime = (file.mimetype || 'image/jpeg').toLowerCase();
  const isVideo = mime.startsWith('video/');

  if (isVideo) {
    const { assertValidHeroVideoUpload } = await import('../../utils/videoBinaryValidation.js');
    const videoCheck = assertValidHeroVideoUpload(buffer, mime);
    console.log('[HERO_VIDEO_VALIDATE]', {
      stage: 'server_binary',
      ok: videoCheck.ok,
      mimeType: mime,
      sizeBytes: buffer.length,
      reason: videoCheck.ok ? null : videoCheck.error,
    });
    if (!videoCheck.ok) {
      const err = new Error(videoCheck.message);
      err.code = videoCheck.error;
      err.statusCode = 400;
      throw err;
    }
  }

  const maxBytes = isVideo ? VIDEO_UPLOAD_MAX_BYTES : 20 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    const err = new Error(isVideo ? `Video must be ${VIDEO_UPLOAD_MAX_MB}MB or smaller.` : 'Image must be 20MB or smaller.');
    err.code = 'file_too_large';
    err.statusCode = 400;
    throw err;
  }

  if (isVideo) {
    const skipVideoCompat =
      videoUploadSkipTranscodeEnabled() || buffer.length > videoUploadMaxTranscodeBytes();
    if (skipVideoCompat) {
      console.log('[Stores] upload/hero: skipping video compat/ffmpeg (policy or size cap)', {
        originalName: file.originalname,
        sizeBytes: buffer.length,
        skipTranscodeEnv: videoUploadSkipTranscodeEnabled(),
        maxTranscodeBytes: videoUploadMaxTranscodeBytes(),
      });
    } else {
      try {
        const processed = await ensureWebCompatibleVideoBuffer(
          buffer,
          file.originalname || 'hero.mp4',
          { context: 'stores.upload.hero' },
        );
        buffer = processed.buffer;
        mime = processed.mime;
        if (processed.transcoded) {
          console.log('[Stores] upload/hero: video transcoded for browser/TV compatibility', {
            originalName: file.originalname,
            sizeBytes: buffer.length,
          });
        }
      } catch (videoErr) {
        console.warn(
          '[Stores] upload/hero: video compat processing failed (non-fatal):',
          videoErr?.message || videoErr,
        );
      }
    }
  }

  const defaultName = isVideo ? 'hero.mp4' : 'hero.jpg';
  const heroCategory = isVideo ? 'videos' : 'stores';
  const { key, url: storageUrl } = await uploadBufferToS3(
    buffer,
    file.originalname || defaultName,
    mime,
    heroCategory,
  );
  const uploadPayload = buildStorageUploadResponse({
    storageUrl,
    key,
    mime,
    mediaType: isVideo ? 'video' : 'image',
    req,
  });
  const persistedHeroUrl = resolvePersistedHeroMediaUrl(uploadPayload);

  try {
    await db.media.create({
      data: {
        url: persistedHeroUrl,
        storageKey: key,
        kind: isVideo ? 'VIDEO' : 'IMAGE',
        mime,
        sizeBytes: buffer.length,
      },
    });
  } catch (mediaErr) {
    console.warn('[Stores] upload/hero: Media create failed (non-fatal), draft preview will still be updated:', mediaErr?.message);
  }

  const existingPreview = draft
    ? typeof draft.preview === 'string'
      ? (() => {
          try {
            return JSON.parse(draft.preview);
          } catch {
            return {};
          }
        })()
      : draft.preview || {}
    : {};
  const previewPatch = buildHeroPreviewPatchFromUrls({
    imageUrl: isVideo ? null : persistedHeroUrl,
    videoUrl: isVideo ? persistedHeroUrl : null,
    source: 'upload',
    existingPreview,
  });
  const storeIdParam = storeId !== 'temp' ? storeId : draft?.committedStoreId;
  const heroResult = await updateHeroForStore({
    prisma: db,
    userId,
    storeId: storeIdParam,
    draftId: draft?.id ?? null,
    generationRunId,
    missionId,
    previewPatch,
    source: 'upload',
  });

  let hasUnpublishedHeroChanges = false;
  if (heroResult.storeId && heroResult.draftUpdated) {
    try {
      const { buildDraftPublishState } = await import('./buildDraftPublishState.js');
      const freshDraft = heroResult.draftId ? await getDraft(heroResult.draftId) : draft;
      if (freshDraft) {
        const pubState = await buildDraftPublishState(db, freshDraft);
        hasUnpublishedHeroChanges = Boolean(pubState.hasUnpublishedChanges);
      }
    } catch {
      /* non-fatal */
    }
  }

  const publicUrl = uploadPayload.publicUrl;
  const clientVideoUrl = isVideo
    ? resolveClientHeroMediaUrl(heroResult.heroVideoUrl, publicUrl, req)
    : null;
  const clientImageUrl = !isVideo
    ? resolveClientHeroMediaUrl(heroResult.heroImageUrl, publicUrl, req)
    : (heroResult.heroImageUrl ?? null);

  console.log('[HERO_VIDEO_APPLY]', {
    mediaType: isVideo ? 'video' : 'image',
    mimeType: mime,
    storageDriver: uploadPayload.storageDriver,
    publicUrl,
    persistedHeroUrl,
    heroVideoUrl: clientVideoUrl,
    heroImageUrl: clientImageUrl,
    draftUpdated: heroResult.draftUpdated,
    businessUpdated: heroResult.businessUpdated,
  });

  return {
    ok: true,
    url: isVideo ? clientVideoUrl : clientImageUrl,
    publicUrl,
    mediaType: isVideo ? 'video' : 'image',
    mimeType: mime,
    size: buffer.length,
    heroImageUrl: clientImageUrl,
    heroVideoUrl: clientVideoUrl,
    heroMediaType: isVideo ? 'video' : heroResult.heroMediaType ?? 'image',
    videoUrl: clientVideoUrl,
    isVideo,
    key,
    storageKey: key,
    storageDriver: uploadPayload.storageDriver,
    draftUpdated: heroResult.draftUpdated,
    businessUpdated: heroResult.businessUpdated,
    hasUnpublishedHeroChanges,
  };
}
