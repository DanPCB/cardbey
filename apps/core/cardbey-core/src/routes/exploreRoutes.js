/**
 * Explore featured videos API
 * GET    /api/explore/videos
 * POST   /api/explore/videos/upload
 * PATCH  /api/explore/videos/:id
 * DELETE /api/explore/videos/:id
 */
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { normalizeMediaUrlForStorage } from '../utils/publicUrl.js';
import {
  canManageExploreVideos,
  deleteExploreVideo,
  getExploreVideoById,
  listExploreVideos,
  updateExploreVideo,
} from '../services/explore/exploreVideoService.js';
import { validateExploreVideoPublishUrl } from '../services/explore/exploreVideoUrlValidation.js';
import { assertUiWriteAuthority } from '../lib/runtime/performerRuntime/uiWriteAuthorityGuard.js';
import { assertLegacyUploadAuthority } from '../lib/runtime/performerRuntime/runtimeUploadAuthority.js';
import {
  exploreVideoUploadFields,
  handleExploreVideoUploadRequest,
} from '../services/explore/exploreVideoUploadService.js';

const router = Router();

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
  exploreVideoUploadFields(),
  async (req, res) => {
    assertLegacyUploadAuthority(req, {
      mutationType: req.body?.status === 'draft' ? 'explore_upload_draft' : 'publish_explore',
      route: 'POST /api/explore/videos/upload',
      userId: req.userId ?? req.user?.id ?? null,
      missionId: req.body?.missionId ?? null,
      source: 'ui_explore',
      deprecatedHint:
        'Direct explore upload — use POST /api/performer/runtime/ui-action/upload-explore-video',
    });
    return handleExploreVideoUploadRequest(req, res);
  },
);

router.patch('/videos/:id', requireAuth, requireExploreVideoManager, async (req, res, next) => {
  try {
    assertUiWriteAuthority(req, {
      mutationType: req.body?.status === 'published' ? 'publish_explore' : 'explore_patch',
      route: 'PATCH /api/explore/videos/:id',
      userId: req.userId ?? req.user?.id ?? null,
      missionId: req.body?.missionId ?? null,
      source: 'ui_explore',
    });
    const isAdmin = req.user?.role === 'admin' || req.user?.isDevAdmin;
    const patch = { ...(req.body || {}) };
    if (patch.videoUrl != null) {
      patch.videoUrl = normalizeMediaUrlForStorage(String(patch.videoUrl), req);
    }
    if (patch.thumbnailUrl != null) {
      patch.thumbnailUrl = normalizeMediaUrlForStorage(String(patch.thumbnailUrl), req);
    }

    const existing = await getExploreVideoById(req.params.id);
    const targetStatus = patch.status ?? existing?.status ?? 'published';
    const targetUrl = patch.videoUrl ?? existing?.videoUrl;

    if (targetStatus === 'published' && targetUrl) {
      const validation = await validateExploreVideoPublishUrl(targetUrl, { req });
      if (!validation.ok) {
        return res.status(400).json({
          ok: false,
          error: validation.code || 'video_not_playable',
          message: validation.message || 'Video URL is not playable',
        });
      }
    }

    const updated = await updateExploreVideo(req.params.id, patch, req.user?.id, isAdmin);
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
    assertUiWriteAuthority(req, {
      mutationType: 'explore_delete',
      route: 'DELETE /api/explore/videos/:id',
      userId: req.userId ?? req.user?.id ?? null,
      missionId: req.query?.missionId ?? req.body?.missionId ?? null,
      source: 'ui_explore',
    });
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
