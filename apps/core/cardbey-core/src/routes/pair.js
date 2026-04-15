import { Router } from 'express';
import { findByCode, getPairSession, updatePairSession, expireSessions } from '../pair/sessionStore.js';

const router = Router();

// DEPRECATED: GET /api/pair/sessions/:sessionId/status
// This route is deprecated. Use GET /api/screens/pair/peek/:code instead.
// Kept for backward compatibility but will be removed in a future version.
router.get('/sessions/:sessionId/status', async (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'session_required' });
    }

    console.warn(`[Pairing] DEPRECATED: /pair/sessions/:id/status called. Use /api/screens/pair/peek/:code instead.`);

    // Expire sessions before checking
    expireSessions();
    
    const session = getPairSession(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'not_found', deprecated: true });
    }

    // expiresAt is a number (timestamp) in v2
    const ttlLeftMs = Math.max(0, session.expiresAt - Date.now());
    let current = session;
    if (session.status !== 'expired' && ttlLeftMs <= 0) {
      current = updatePairSession(session.sessionId, 'expired');
    }

    return res.json({
      ok: true,
      sessionId: current.sessionId,
      status: current.status,
      screenId: current.screenId ?? null,
      expiresAt: current.expiresAt,
      ttlLeftMs: Math.max(0, current.expiresAt - Date.now()),
      code: current.code,
      token: current.token || null, // Primary field name
      deviceJwt: current.token || null, // Backward compatibility alias
      deprecated: true,
      message: 'This endpoint is deprecated. Use GET /api/screens/pair/peek/:code or GET /api/screens/pair/sessions/:sessionId/status instead.',
    });
  } catch (error) {
    return next(error);
  }
});

// DEPRECATED: GET /api/pair/codes/:code/status
// This route is deprecated. Use GET /api/screens/pair/peek/:code instead.
// Kept for backward compatibility but will be removed in a future version.
router.get('/codes/:code/status', async (req, res, next) => {
  try {
    const rawCode = String(req.params.code || '').trim();
    if (!rawCode) {
      return res.status(400).json({ ok: false, error: 'code_required' });
    }
    
    console.warn(`[Pairing] DEPRECATED: /pair/codes/:code/status called. Use /api/screens/pair/peek/:code instead.`);
    
    // Expire sessions before checking
    expireSessions();
    
    const session = findByCode(rawCode);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'not_found', deprecated: true });
    }

    // expiresAt is a number (timestamp) in v2
    const ttlLeftMs = Math.max(0, session.expiresAt - Date.now());
    let current = session;
    if (session.status !== 'expired' && ttlLeftMs <= 0) {
      current = updatePairSession(session.sessionId, 'expired');
    }

    return res.json({
      ok: true,
      sessionId: current.sessionId,
      status: current.status,
      screenId: current.screenId ?? null,
      expiresAt: current.expiresAt,
      ttlLeftMs: Math.max(0, current.expiresAt - Date.now()),
      code: current.code,
      token: current.token || null, // Primary field name
      deviceJwt: current.token || null, // Backward compatibility alias
      deprecated: true,
      message: 'This endpoint is deprecated. Use GET /api/screens/pair/peek/:code or GET /api/screens/pair/sessions/:sessionId/status instead.',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

