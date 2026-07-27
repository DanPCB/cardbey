/**
 * Explore featured video upload — shared by legacy route and runtime authority route.
 */

import multer from 'multer';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { ensureWebCompatibleVideoBuffer } from '../../lib/videoCompat.js';
import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';
import {
  canManageExploreVideos,
  createExploreVideo,
  getExploreVideoMaxBytes,
  validateVideoMime,
} from './exploreVideoService.js';
import { validateExploreVideoPublishUrl } from './exploreVideoUrlValidation.js';
import { generateExploreVideoPosterFromBuffer } from './exploreVideoPosterService.js';

export const exploreVideoUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getExploreVideoMaxBytes() },
});

export function exploreVideoUploadFields() {
  return exploreVideoUploadMulter.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]);
}

/**
 * @param {import('express').Request} req
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function executeExploreVideoUpload(req) {
  const allowed = await canManageExploreVideos(req.user);
  if (!allowed) {
    return {
      status: 403,
      body: {
        ok: false,
        error: 'forbidden',
        message: 'Admin or business owner access required to manage explore videos',
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
      videoFile.originalname || 'explore-video.mp4',
      { context: 'explore.videos.upload' },
    );
    videoBuffer = processed.buffer;
    videoMime = processed.mime || videoMime;
    if (processed.durationS != null) detectedDuration = processed.durationS;
  } catch (videoErr) {
    console.warn('[explore] video compat processing failed (non-fatal):', videoErr?.message || videoErr);
  }

  const videoUpload = await uploadBufferToS3(
    videoBuffer,
    videoFile.originalname || 'explore-video.mp4',
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
      thumbFile.originalname || 'explore-thumb.jpg',
      thumbFile.mimetype,
      'stores',
    );
    thumbnailUrl = thumbUpload.url;
  } else {
    const poster = await generateExploreVideoPosterFromBuffer(videoBuffer, {
      originalName: videoFile.originalname || 'explore-video.mp4',
      durationSec: detectedDuration,
      context: 'explore.videos.upload',
    });
    if (poster.ok) thumbnailUrl = poster.url;
  }

  const durationRaw = req.body?.duration;
  const duration =
    durationRaw != null && durationRaw !== '' && Number.isFinite(Number(durationRaw))
      ? Math.round(Number(durationRaw))
      : detectedDuration;

  const publishStatus = req.body?.status === 'draft' ? 'draft' : 'published';
  const videoUrl = normalizeMediaUrlForStorage(videoUpload.url, req);
  const normalizedThumb = thumbnailUrl ? normalizeMediaUrlForStorage(thumbnailUrl, req) : null;

  if (publishStatus === 'published') {
    const validation = await validateExploreVideoPublishUrl(videoUrl, { req });
    if (!validation.ok) {
      return {
        status: 400,
        body: {
          ok: false,
          error: validation.code || 'video_not_playable',
          message: validation.message || 'Video URL is not playable',
        },
      };
    }
  }

  const created = await createExploreVideo({
    title: req.body?.title,
    description: req.body?.description,
    category: req.body?.category,
    videoUrl,
    thumbnailUrl: normalizedThumb,
    duration,
    ctaIntent: req.body?.ctaIntent || null,
    status: publishStatus,
    createdBy: req.user?.id || null,
  });

  return { status: 201, body: { ok: true, video: created } };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleExploreVideoUploadRequest(req, res) {
  try {
    const result = await executeExploreVideoUpload(req);
    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err.message === 'title_and_video_required') {
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: 'Title and video are required',
      });
    }
    console.error('[explore] video upload failed:', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: 'upload_failed',
      message: err?.message || 'Video upload failed',
    });
  }
}
