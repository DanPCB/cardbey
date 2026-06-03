/**
 * Shared hero/avatar multipart upload for draft preview (images + short video).
 */
import multer from 'multer';
import { getPrismaClient } from '../../lib/prisma.js';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';
import { getDraft, getDraftByGenerationRunId } from './draftStoreService.js';
import { buildHeroPreviewPatchFromUrls } from './heroUpdateService.js';
import { updateHeroForStore } from './heroUpdateService.js';
import { resolveDraftForStore } from '../../lib/draftResolver.js';
import { canAccessDraftStore } from '../../lib/draftOwnership.js';
import { hasRole } from '../../lib/authorization.js';

const prisma = getPrismaClient();

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const ALLOWED_HERO_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_HERO_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_HERO_VIDEO_MIMES];

export const heroAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 75 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = file.mimetype ? String(file.mimetype).toLowerCase() : '';
    if (mime && ALLOWED_HERO_MIMES.includes(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Use JPG, PNG, WebP, GIF, SVG, MP4, WebM, or MOV.'), false);
    }
  },
});

export function heroAssetUploadSingle(req, res, next) {
  heroAssetUpload.single('file')(req, res, (err) => {
    if (err) {
      const isLimit = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        ok: false,
        error: isLimit ? 'file_too_large' : 'invalid_file',
        message: isLimit ? 'File must be 75MB or smaller.' : err.message || 'Invalid or missing file',
      });
    }
    next();
  });
}

/**
 * Resolve draft row for hero upload (draftId param, query draftId, generationRunId, or store path).
 * @returns {Promise<{ draft?: object, errorResponse?: { status: number, body: object } }>}
 */
export async function resolveDraftForHeroUpload({
  userId,
  user,
  draftId,
  generationRunId,
  routeStoreId,
}) {
  if (!userId) {
    return {
      errorResponse: {
        status: 401,
        body: { ok: false, error: 'unauthorized', message: 'Authentication required' },
      },
    };
  }

  const explicitDraftId = typeof draftId === 'string' ? draftId.trim() : '';
  const runId = typeof generationRunId === 'string' ? generationRunId.trim() : '';
  const storeId = typeof routeStoreId === 'string' ? routeStoreId.trim() : '';

  if (explicitDraftId) {
    let draft = await getDraft(explicitDraftId);
    if (!draft && runId) {
      draft = await getDraftByGenerationRunId(runId);
    }
    if (!draft && storeId && storeId !== 'temp') {
      const resolved = await resolveDraftForStore(prisma, storeId, runId || null);
      draft = resolved.draft;
    }
    if (!draft) {
      return {
        errorResponse: {
          status: 404,
          body: { ok: false, error: 'draft_not_found', message: 'Draft not found' },
        },
      };
    }
    const allowed = await canAccessDraftStore(draft, {
      userId,
      tenantKey: userId,
      isSuperAdmin: Boolean(user && hasRole(user, 'super_admin')),
    });
    if (!allowed) {
      return {
        errorResponse: {
          status: 403,
          body: { ok: false, error: 'forbidden', message: 'You do not have access to this draft.' },
        },
      };
    }
    return { draft };
  }

  if (storeId === 'temp') {
    if (!runId) {
      return {
        errorResponse: {
          status: 400,
          body: {
            ok: false,
            error: 'generationRunId_required',
            message: 'Query generationRunId required when storeId is temp',
          },
        },
      };
    }
    const { isDraftOwnedByUser } = await import('../../lib/draftOwnership.js');
    const allowed = await isDraftOwnedByUser(runId, userId);
    if (!allowed) {
      return {
        errorResponse: {
          status: 403,
          body: { ok: false, error: 'forbidden', message: 'You do not have access to this draft.' },
        },
      };
    }
    const draft = await getDraftByGenerationRunId(runId);
    if (!draft) {
      return {
        errorResponse: {
          status: 404,
          body: { ok: false, error: 'draft_not_found', message: 'Draft not found' },
        },
      };
    }
    return { draft };
  }

  if (storeId) {
    const resolved = await resolveDraftForStore(prisma, storeId, runId || null);
    if (!resolved.draft) {
      return {
        errorResponse: {
          status: 404,
          body: { ok: false, error: 'draft_not_found', message: 'Draft not found' },
        },
      };
    }
    const business = await prisma.business.findUnique({ where: { id: storeId }, select: { userId: true } });
    if (!business || business.userId !== userId) {
      return {
        errorResponse: {
          status: 403,
          body: { ok: false, error: 'forbidden', message: 'You do not have access to this store.' },
        },
      };
    }
    return { draft: resolved.draft };
  }

  return {
    errorResponse: {
      status: 400,
      body: { ok: false, error: 'draft_id_required', message: 'draftId is required' },
    },
  };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ draft: object, routeStoreId?: string | null }} opts
 */
export async function executeHeroAssetUpload(req, res, { draft, routeStoreId }) {
  if (!req.file?.buffer) {
    return res.status(400).json({
      ok: false,
      error: 'no_file',
      message: 'No file uploaded; use multipart field "file".',
    });
  }

  const buffer = req.file.buffer;
  const mime = (req.file.mimetype || 'image/jpeg').toLowerCase();
  const isVideo = mime.startsWith('video/');
  const maxBytes = isVideo ? 75 * 1024 * 1024 : 20 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return res.status(400).json({
      ok: false,
      error: 'file_too_large',
      message: isVideo ? 'Video must be 75MB or smaller.' : 'Image must be 20MB or smaller.',
    });
  }

  const defaultName = isVideo ? 'hero.mp4' : 'hero.jpg';
  const { key, url: storageUrl } = await uploadBufferToS3(
    buffer,
    req.file.originalname || defaultName,
    mime,
  );
  const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);
  try {
    await prisma.media.create({
      data: {
        url: normalizedUrl,
        storageKey: key,
        kind: isVideo ? 'VIDEO' : 'IMAGE',
        mime,
        sizeBytes: buffer.length,
      },
    });
  } catch (mediaErr) {
    console.warn(
      '[heroAssetUpload] Media create failed (non-fatal), draft preview will still be updated:',
      mediaErr?.message,
    );
  }

  const heroImageUrl = normalizedUrl;
  const existingPreview =
    typeof draft.preview === 'string'
      ? (() => {
          try {
            return JSON.parse(draft.preview);
          } catch {
            return {};
          }
        })()
      : draft.preview || {};

  const previewPatch = buildHeroPreviewPatchFromUrls({
    imageUrl: isVideo ? null : heroImageUrl,
    videoUrl: isVideo ? heroImageUrl : null,
    source: 'upload',
    existingPreview,
  });

  const storeIdParam =
    routeStoreId && routeStoreId !== 'temp' ? routeStoreId : draft.committedStoreId;
  const generationRunId =
    (typeof req.query.generationRunId === 'string' ? req.query.generationRunId.trim() : null) ||
    (typeof req.body?.generationRunId === 'string' ? req.body.generationRunId.trim() : null);

  const heroResult = await updateHeroForStore({
    prisma,
    userId: req.userId,
    storeId: storeIdParam,
    draftId: draft.id,
    generationRunId,
    previewPatch,
    source: 'upload',
  });

  return res.status(200).json({
    ok: true,
    url: heroImageUrl,
    heroImageUrl: heroResult.heroImageUrl,
    videoUrl: heroResult.heroVideoUrl,
    mimeType: mime,
    isVideo,
    key,
    storageKey: key,
    draftUpdated: heroResult.draftUpdated,
    businessUpdated: heroResult.businessUpdated,
  });
}
