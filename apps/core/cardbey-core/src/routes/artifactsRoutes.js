/**
 * Artifact routes: refresh signed download URLs for tool-generated artifacts.
 * Security: requireAuth + canAccessMission(missionId). storageKey is never accepted from client; only from artifact lookup.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { canAccessMission } from './agentMessagesRoutes.js';
import { getPresignedGetUrl } from '../lib/s3Client.js';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /api/artifacts/:artifactId/refresh-url
 * Refresh a signed download URL for an artifact message. Caller must have access to the mission.
 * Body: none. Returns { ok: true, url, expiresAt } or 403/404.
 */
router.post('/:artifactId/refresh-url', requireAuth, async (req, res, next) => {
  try {
    const artifactId = typeof req.params.artifactId === 'string' ? req.params.artifactId.trim() : '';
    if (!artifactId) {
      return res.status(400).json({ ok: false, code: 'ARTIFACT_ID_REQUIRED', message: 'artifactId is required' });
    }

    const message = await prisma.agentMessage.findUnique({
      where: { id: artifactId },
      select: { missionId: true, messageType: true, payload: true },
    });

    if (!message) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Artifact not found' });
    }
    if (message.messageType !== 'artifact') {
      return res.status(404).json({ ok: false, code: 'NOT_ARTIFACT', message: 'Message is not an artifact' });
    }

    const missionId = message.missionId?.trim?.() ?? '';
    if (!missionId) {
      return res.status(400).json({ ok: false, code: 'MISSION_MISSING', message: 'Artifact has no mission' });
    }

    const allowed = await canAccessMission(missionId, req.user);
    if (!allowed) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'No access to this mission' });
    }

    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    const storageKey = typeof payload.storageKey === 'string' ? payload.storageKey.trim() : null;
    if (!storageKey) {
      return res.status(400).json({
        ok: false,
        code: 'NO_STORAGE_KEY',
        message: 'Artifact has no storageKey; cannot refresh URL',
      });
    }

    const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
    const ttlSeconds = typeof meta.signedUrlTtlSeconds === 'number'
      ? Math.max(60, Math.min(86400, meta.signedUrlTtlSeconds))
      : 3600;

    const { url, expiresAt } = await getPresignedGetUrl(storageKey, ttlSeconds);
    return res.json({ ok: true, url, expiresAt });
  } catch (err) {
    if (err.message?.includes('S3_BUCKET_NAME') || err.code === 'CredentialsError') {
      return res.status(503).json({
        ok: false,
        code: 'STORAGE_UNAVAILABLE',
        message: 'Storage signing is unavailable',
      });
    }
    next(err);
  }
});

export default router;
