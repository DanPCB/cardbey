/**
 * Creator Studio media upload — reuses Runtime Authority S3 pipeline (explore video pattern).
 * Storage only; does not publish. Caller attaches URLs to CreatorContent via runtime tools.
 */

import multer from 'multer';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { ensureWebCompatibleVideoBuffer } from '../../lib/videoCompat.js';
import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';
import { getExploreVideoMaxBytes, validateVideoMime } from '../explore/exploreVideoService.js';
import { generateExploreVideoPosterFromBuffer } from '../explore/exploreVideoPosterService.js';
import { getPrismaClient } from '../../lib/prisma.js';

export const creatorMediaUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getExploreVideoMaxBytes() },
});

export function creatorVideoUploadFields() {
  return creatorMediaUploadMulter.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]);
}

/**
 * @param {string|null} userId
 * @returns {Promise<boolean>}
 */
export async function canUploadCreatorMedia(userId) {
  if (!userId) return false;
  const prisma = getPrismaClient();
  const creator = await prisma.creator.findUnique({
    where: { userId },
    select: { id: true },
  });
  return Boolean(creator);
}

/**
 * @param {import('express').Request} req
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function executeCreatorVideoUpload(req) {
  const userId = req.user?.id ?? req.userId ?? null;
  const allowed = await canUploadCreatorMedia(userId);
  if (!allowed) {
    return {
      status: 403,
      body: {
        ok: false,
        error: 'creator_required',
        message: 'Create a Creator profile before uploading media',
      },
    };
  }

  const videoFile = req.files?.video?.[0];
  const thumbFile = req.files?.thumbnail?.[0];

  if (!videoFile) {
    return {
      status: 400,
      body: { ok: false, error: 'missing_video', message: 'Video file is required' },
    };
  }

  if (!validateVideoMime(videoFile.mimetype)) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'invalid_video_type',
        message: 'Supported video types: mp4, webm, mov',
      },
    };
  }

  if (videoFile.size > getExploreVideoMaxBytes()) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'file_too_large',
        message: `Video exceeds max size of ${getExploreVideoMaxBytes()} bytes`,
      },
    };
  }

  let videoBuffer = videoFile.buffer;
  let videoMime = videoFile.mimetype;
  let detectedDuration = null;
  try {
    const processed = await ensureWebCompatibleVideoBuffer(
      videoBuffer,
      videoFile.originalname || 'creator-video.mp4',
      { context: 'creator.studio.upload' },
    );
    videoBuffer = processed.buffer;
    videoMime = processed.mime || videoMime;
    if (processed.durationS != null) detectedDuration = processed.durationS;
  } catch (videoErr) {
    console.warn('[creator] video compat processing failed (non-fatal):', videoErr?.message || videoErr);
  }

  const videoUpload = await uploadBufferToS3(
    videoBuffer,
    videoFile.originalname || 'creator-video.mp4',
    videoMime,
    'videos',
  );

  let thumbnailUrl = null;
  if (thumbFile) {
    if (!String(thumbFile.mimetype || '').startsWith('image/')) {
      return {
        status: 400,
        body: { ok: false, error: 'invalid_thumbnail_type', message: 'Thumbnail must be an image' },
      };
    }
    const thumbUpload = await uploadBufferToS3(
      thumbFile.buffer,
      thumbFile.originalname || 'creator-thumb.jpg',
      thumbFile.mimetype,
      'stores',
    );
    thumbnailUrl = thumbUpload.url;
  } else {
    const poster = await generateExploreVideoPosterFromBuffer(videoBuffer, {
      originalName: videoFile.originalname || 'creator-video.mp4',
      durationSec: detectedDuration,
      context: 'creator.studio.upload',
    });
    if (poster.ok) thumbnailUrl = poster.url;
  }

  const durationRaw = req.body?.duration;
  const durationSeconds =
    durationRaw != null && durationRaw !== '' && Number.isFinite(Number(durationRaw))
      ? Math.round(Number(durationRaw))
      : detectedDuration;

  const media = {
    mediaUrl: normalizeMediaUrlForStorage(videoUpload.url, req),
    thumbnail: thumbnailUrl ? normalizeMediaUrlForStorage(thumbnailUrl, req) : null,
    durationSeconds: durationSeconds ?? null,
  };

  return { status: 201, body: { ok: true, media } };
}
