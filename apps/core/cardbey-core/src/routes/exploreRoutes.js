/**
 * Explore featured videos API
 * GET    /api/explore/videos
 * POST   /api/explore/videos/upload
 * PATCH  /api/explore/videos/:id
 * DELETE /api/explore/videos/:id
 */
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { uploadBufferToS3 } from '../lib/s3Client.js';
import { ensureWebCompatibleVideoBuffer } from '../lib/videoCompat.js';
import {
  canManageExploreVideos,
  createExploreVideo,
  deleteExploreVideo,
  getExploreVideoMaxBytes,
  listExploreVideos,
  updateExploreVideo,
  validateVideoMime,
} from '../services/explore/exploreVideoService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getExploreVideoMaxBytes() },
});

async function requireExploreVideoManager(req, res, next) {
  try {
    const allowed = await canManageExploreVideos(req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'Admin or business owner access required to manage explore videos',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/explore/videos
 * Public: published only. Managers may pass ?includeDraft=1 when authenticated.
 */
router.get('/videos', optionalAuth, async (req, res, next) => {
  try {
    const wantsDraft = req.query.includeDraft === '1' || req.query.includeDraft === 'true';
    let includeDraft = false;
    if (wantsDraft && req.user) {
      includeDraft = await canManageExploreVideos(req.user);
    }
    const videos = await listExploreVideos({ includeDraft });
    res.json({ ok: true, videos });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/explore/videos/upload
 * multipart: video (required), thumbnail (optional), fields: title, description, category, ctaIntent, status, duration
 */
router.post(
  '/videos/upload',
  requireAuth,
  requireExploreVideoManager,
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const videoFile = req.files?.video?.[0];
      const thumbFile = req.files?.thumbnail?.[0];

      if (!videoFile) {
        return res.status(400).json({
          ok: false,
          error: 'missing_video',
          message: 'Video file is required',
        });
      }

      if (!validateVideoMime(videoFile.mimetype)) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_video_type',
          message: 'Supported video types: mp4, webm, mov',
        });
      }

      if (videoFile.size > getExploreVideoMaxBytes()) {
        return res.status(400).json({
          ok: false,
          error: 'file_too_large',
          message: `Video exceeds max size of ${getExploreVideoMaxBytes()} bytes`,
        });
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
      );

      let thumbnailUrl = null;
      if (thumbFile) {
        if (!String(thumbFile.mimetype || '').startsWith('image/')) {
          return res.status(400).json({
            ok: false,
            error: 'invalid_thumbnail_type',
            message: 'Thumbnail must be an image',
          });
        }
        const thumbUpload = await uploadBufferToS3(
          thumbFile.buffer,
          thumbFile.originalname || 'explore-thumb.jpg',
          thumbFile.mimetype,
        );
        thumbnailUrl = thumbUpload.url;
      }

      const durationRaw = req.body?.duration;
      const duration =
        durationRaw != null && durationRaw !== '' && Number.isFinite(Number(durationRaw))
          ? Math.round(Number(durationRaw))
          : detectedDuration;

      const created = await createExploreVideo({
        title: req.body?.title,
        description: req.body?.description,
        category: req.body?.category,
        videoUrl: videoUpload.url,
        thumbnailUrl,
        duration,
        ctaIntent: req.body?.ctaIntent || null,
        status: req.body?.status === 'draft' ? 'draft' : 'published',
        createdBy: req.user?.id || null,
      });

      res.status(201).json({ ok: true, video: created });
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
  },
);

router.patch('/videos/:id', requireAuth, requireExploreVideoManager, async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.isDevAdmin;
    const updated = await updateExploreVideo(req.params.id, req.body || {}, req.user?.id, isAdmin);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Video not found' });
    }
    res.json({ ok: true, video: updated });
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Not allowed to edit this video' });
    }
    next(err);
  }
});

router.delete('/videos/:id', requireAuth, requireExploreVideoManager, async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.isDevAdmin;
    const ok = await deleteExploreVideo(req.params.id, req.user?.id, isAdmin);
    if (!ok) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Video not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Not allowed to delete this video' });
    }
    next(err);
  }
});

export default router;
