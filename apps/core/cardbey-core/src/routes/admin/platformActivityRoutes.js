/**
 * Platform Activity — Super Admin Control Center realtime event bus.
 * GET /api/admin/platform/activity
 * GET /api/admin/platform/activity/stream (SSE)
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { listPlatformActivityEvents, addPlatformActivityStreamClient, removePlatformActivityStreamClient } from '../../lib/platformActivity/platformActivityStore.js';
import { sanitizePlatformActivityEvent } from '../../lib/platformActivity/platformActivitySanitizer.js';

const router = Router();

const HEARTBEAT_MS = 20_000;

function writePlatformActivitySseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

router.get('/platform/activity', requireAuth, requireAdmin, (req, res) => {
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

router.get('/platform/activity/stream', requireAuth, requireAdmin, (req, res) => {
  writePlatformActivitySseHeaders(res);
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  req.socket?.setTimeout?.(0);
  req.socket?.setNoDelay?.(true);
  if (typeof req.socket?.setKeepAlive === 'function') {
    req.socket.setKeepAlive(true, HEARTBEAT_MS);
  }

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
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    removePlatformActivityStreamClient(res);
  });
});

export default router;
