/**
 * Platform Activity — Super Admin Control Center realtime event bus.
 * GET /api/admin/platform/activity
 * GET /api/admin/platform/activity/stream (SSE)
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { listPlatformActivityEvents, addPlatformActivityStreamClient } from '../../lib/platformActivity/platformActivityStore.js';
import { sanitizePlatformActivityEvent } from '../../lib/platformActivity/platformActivitySanitizer.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/platform/activity', (req, res) => {
  try {
    const limit = req.query.limit;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const events = listPlatformActivityEvents({ limit, category, severity, since }).map(sanitizePlatformActivityEvent);
    res.json({ ok: true, events });
  } catch (err) {
    console.error('[admin/platform/activity]', err);
    res.status(500).json({ ok: false, error: 'platform_activity_list_failed' });
  }
});

router.get('/platform/activity/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  addPlatformActivityStreamClient(res);
  res.write(': connected\n\n');

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

export default router;
