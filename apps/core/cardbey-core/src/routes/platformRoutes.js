/**
 * Platform Routes — unified connection management for social and LLM platforms.
 * Mount at /api/platforms
 */

import express from 'express';
import platformService from '../services/platforms/platformService.js';
import { getPlatformById } from '../lib/platforms/platformRegistry.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function rejectGuest(req, res) {
  if (req.user?.role === 'guest') {
    return res.status(403).json({
      ok: false,
      error: 'guest_forbidden',
      message: 'Guest sessions cannot manage platform connections. Sign in with a full account.',
    });
  }
  return null;
}

router.get('/registry', requireAuth, (_req, res) => {
  res.json({ ok: true, ...platformService.listRegistry() });
});

router.get('/status', requireAuth, async (req, res) => {
  const guestBlock = rejectGuest(req, res);
  if (guestBlock) return guestBlock;

  try {
    const userId = String(req.user?.id ?? '').trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const platforms = await platformService.getStatus(userId);
    return res.json({ ok: true, platforms });
  } catch (err) {
    console.error('[platforms] status error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'status_failed' });
  }
});

router.get('/:platformId/status', requireAuth, async (req, res) => {
  const guestBlock = rejectGuest(req, res);
  if (guestBlock) return guestBlock;

  const platform = getPlatformById(req.params.platformId);
  if (!platform) {
    return res.status(404).json({ ok: false, error: 'platform_not_found' });
  }

  try {
    const status = await platformService.checkPlatformStatus(String(req.user?.id ?? '').trim(), platform);
    return res.json({ ok: true, ...status });
  } catch (err) {
    console.error('[platforms] platform status error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'status_failed' });
  }
});

router.post('/:platformId/connect', requireAuth, async (req, res) => {
  const guestBlock = rejectGuest(req, res);
  if (guestBlock) return guestBlock;

  const { platformId } = req.params;
  try {
    const result = await platformService.connectPlatform(
      String(req.user?.id ?? '').trim(),
      platformId,
      req.body ?? {},
    );
    return res.json(result);
  } catch (err) {
    if (err?.code === 'missing_credential') {
      return res.status(400).json({
        ok: false,
        error: err.code,
        field: err.field,
        message: err.message,
      });
    }
    if (String(err?.message ?? '').includes('not found')) {
      return res.status(404).json({ ok: false, error: 'platform_not_found', message: err.message });
    }
    console.error('[platforms] connect error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'connect_failed', message: err?.message });
  }
});

router.post('/:platformId/disconnect', requireAuth, async (req, res) => {
  const guestBlock = rejectGuest(req, res);
  if (guestBlock) return guestBlock;

  const { platformId } = req.params;
  try {
    const result = await platformService.disconnectPlatform(String(req.user?.id ?? '').trim(), platformId);
    return res.json(result);
  } catch (err) {
    if (String(err?.message ?? '').includes('not found')) {
      return res.status(404).json({ ok: false, error: 'platform_not_found', message: err.message });
    }
    console.error('[platforms] disconnect error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'disconnect_failed', message: err?.message });
  }
});

export default router;
