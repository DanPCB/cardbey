/**
 * Unified Memory API Routes
 * POST /api/memory/bundle
 * POST /api/memory/invalidate
 */

import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import memoryFacade, { normalizeMemoryContext } from '../services/memory/memoryFacade.js';
import { recordRouteLatency } from '../lib/metrics/foundationMetrics.js';
import bulkhead from '../services/reliability/bulkhead.js';

const router = Router();

const VALID_ACTOR_TYPES = new Set(['guest', 'consumer', 'store_owner', 'admin']);

function resolveActorType(req, bodyActor) {
  const userId = req.user?.id ? String(req.user.id) : null;
  if (userId) {
    const role = String(req.user?.role ?? '').toLowerCase();
    if (role === 'admin' || role === 'platform_admin') return 'admin';
    if (role === 'store_owner' || role === 'business_owner') return 'store_owner';
    return 'consumer';
  }
  if (bodyActor?.type && VALID_ACTOR_TYPES.has(String(bodyActor.type))) {
    return String(bodyActor.type);
  }
  return 'guest';
}

router.post('/bundle', guestSessionId, optionalAuth, async (req, res) => {
  const started = Date.now();
  try {
    const { context } = req.body ?? {};
    const actorType = resolveActorType(req, context?.actor);
    const userId = req.user?.id ? String(req.user.id) : context?.actor?.id ?? context?.actor?.userId ?? null;

    const normalized = normalizeMemoryContext({
      actor: {
        type: actorType,
        id: userId,
        userId,
        email: req.user?.email ?? context?.actor?.email,
      },
      storeId: context?.storeId ?? null,
      sessionId:
        context?.sessionId ??
        req.headers['x-session-id'] ??
        (req.guestSessionId ? `guest_${req.guestSessionId}` : null),
      missionId: context?.missionId ?? null,
      sessionHints: context?.sessionHints ?? {},
      ownerId: userId,
    });

    const bundle = await bulkhead.execute('memory_operations', () => memoryFacade.getBundle(normalized));
    const ms = Date.now() - started;
    recordRouteLatency('memory_bundle', ms);
    res.json({ ok: true, bundle });
  } catch (err) {
    const ms = Date.now() - started;
    recordRouteLatency('memory_bundle', ms, { error: true });
    console.error('[MemoryAPI] bundle error:', err?.message);
    res.status(500).json({ ok: false, error: err?.message ?? 'Failed to fetch memory bundle' });
  }
});

router.post('/invalidate', requireAuth, async (req, res) => {
  try {
    const { context } = req.body ?? {};
    const userId = req.user?.id ? String(req.user.id) : null;
    memoryFacade.invalidate(
      normalizeMemoryContext({
        ...context,
        actor: {
          type: resolveActorType(req, context?.actor),
          id: userId,
          userId,
        },
        ownerId: userId,
      }),
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[MemoryAPI] invalidate error:', err?.message);
    res.status(500).json({ ok: false, error: err?.message ?? 'Failed to invalidate memory cache' });
  }
});

export default router;
