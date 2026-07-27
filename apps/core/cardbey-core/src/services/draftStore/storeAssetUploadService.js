/**
 * Store logo/avatar upload + draft persist (shared by stores routes and runtime authority).
 */

import { getPrismaClient, prisma } from '../../lib/prisma.js';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { buildStorageUploadResponse } from '../../lib/storage/uploadResponse.js';
import { updateLogoForStore } from './logoUpdateService.js';
import { resolveDraftForHeroUpload } from './heroMediaUploadService.js';

export { resolveDraftForHeroUpload };

/**
 * @param {{
 *   userId: string;
 *   storeId: string;
 *   draft: object|null;
 *   file: { buffer: Buffer; mimetype?: string; originalname?: string };
 *   generationRunId?: string|null;
 *   kind: 'logo' | 'avatar';
 *   req?: import('express').Request;
 *   prismaClient?: import('@prisma/client').PrismaClient;
 * }} input
 */
export async function executeStoreLogoOrAvatarUpload(input) {
  const db = input.prismaClient ?? getPrismaClient();
  const { userId, storeId, draft, file, kind, req } = input;
  const generationRunId =
    (typeof input.generationRunId === 'string' ? input.generationRunId.trim() : null) || null;

  if (!file?.buffer) {
    const err = new Error('No file uploaded; use multipart field "file".');
    err.code = 'no_file';
    err.statusCode = 400;
    throw err;
  }

  const mime = (file.mimetype || 'image/jpeg').toLowerCase();
  if (!mime.startsWith('image/')) {
    const err = new Error(`${kind === 'logo' ? 'Logo' : 'Avatar'} must be an image file.`);
    err.code = 'invalid_type';
    err.statusCode = 400;
    throw err;
  }

  const buffer = file.buffer;
  const maxBytes = 20 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    const err = new Error('Image must be 20MB or smaller.');
    err.code = 'file_too_large';
    err.statusCode = 400;
    throw err;
  }

  const category = kind === 'logo' ? 'logos' : 'avatars';
  const defaultName = kind === 'logo' ? 'logo.jpg' : 'avatar.jpg';
  const { key, url: storageUrl } = await uploadBufferToS3(
    buffer,
    file.originalname || defaultName,
    mime,
    category,
  );
  const uploadPayload = buildStorageUploadResponse({
    storageUrl,
    key,
    mime,
    mediaType: 'image',
    req,
  });
  const normalizedUrl = uploadPayload.normalizedUrl;

  try {
    await db.media.create({
      data: {
        url: normalizedUrl,
        storageKey: key,
        kind: 'IMAGE',
        mime,
        sizeBytes: buffer.length,
      },
    });
  } catch (mediaErr) {
    console.warn(`[Stores] upload/${kind}: Media create failed (non-fatal):`, mediaErr?.message);
  }

  const storeIdParam = storeId !== 'temp' ? storeId : draft?.committedStoreId;
  const logoResult = await updateLogoForStore({
    prisma: db,
    userId,
    storeId: storeIdParam,
    draftId: draft?.id ?? null,
    generationRunId,
    logoUrl: normalizedUrl,
  });

  return {
    ok: true,
    url: uploadPayload.publicUrl,
    publicUrl: uploadPayload.publicUrl,
    logoUrl: logoResult.logoUrl,
    avatarImageUrl: logoResult.avatarImageUrl,
    key: uploadPayload.key,
    mimeType: uploadPayload.mimeType,
    mediaType: uploadPayload.mediaType,
    storageDriver: uploadPayload.storageDriver,
    draftUpdated: logoResult.draftUpdated,
    businessUpdated: logoResult.businessUpdated,
  };
}

/**
 * @param {import('express').Request} req
 * @param {{ kind: 'logo' | 'avatar' }} opts
 */
export async function resolveStoreAssetUploadContext(req, opts) {
  const storeId = req.params?.storeId ?? '';
  return resolveDraftForHeroUpload({
    storeId,
    draftId: req.query?.draftId ?? req.body?.draftId ?? null,
    generationRunId: req.query?.generationRunId ?? req.body?.generationRunId ?? null,
    userId: req.userId,
    userRole: req.user?.role ?? null,
  });
}
