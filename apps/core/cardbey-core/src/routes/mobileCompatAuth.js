/**
 * Mobile compatibility auth routes (cardbey-rn).
 * Mount at root so: POST /users, POST /oauth/login, GET /oauth/me, POST /password/request, POST /password/reset.
 * Does not replace /api/auth/*; additive only.
 */

import express from 'express';
import { registerWithEmailPassword, loginWithEmailPassword, getMe } from '../services/auth/authService.js';
import { requestPasswordReset, resetPassword } from '../services/auth/passwordResetService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/** POST /users — register compat. Body: { email, password, name? }. Returns { token, access_token, user, ok: true }. */
router.post('/users', async (req, res, next) => {
  try {
    const { email, password, name } = req.body ?? {};
    const { user, token } = await registerWithEmailPassword({ email, password, name });
    res.status(201).json({
      ok: true,
      token,
      access_token: token,
      user: { id: user.id, email: user.email, name: user.displayName || user.fullName, displayName: user.displayName, ...user },
    });
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') {
      return res.status(409).json({ ok: false, error: 'Email already registered', message: err.message });
    }
    if (err.code === 'MISSING_FIELDS' || err.code === 'PASSWORD_TOO_SHORT') {
      return res.status(400).json({ ok: false, error: err.message, message: err.message });
    }
    next(err);
  }
});

/** POST /oauth/login — login compat. Body: { email, password } or { username, password }. Returns { token, access_token, user, ok: true }. */
router.post('/oauth/login', async (req, res, next) => {
  try {
    const emailOrUsername = (req.body?.email ?? req.body?.username ?? '').toString().trim();
    const { password } = req.body ?? {};
    const { user, token } = await loginWithEmailPassword({ emailOrUsername, password });
    res.json({
      ok: true,
      token,
      access_token: token,
      user,
    });
  } catch (err) {
    if (err.code === 'MISSING_FIELDS') {
      return res.status(400).json({ ok: false, error: err.message, message: err.message });
    }
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ ok: false, error: 'Invalid credentials', message: err.message });
    }
    next(err);
  }
});

/** GET /oauth/me — same as /api/auth/me for compat. Requires Bearer token. */
router.get('/oauth/me', requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role === 'guest') {
      return res.json({ ok: true, user: { id: req.user.id, role: 'guest' } });
    }
    const user = await getMe(req.userId);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'User not found', message: 'Authentication failed. Please log in again.' });
    }
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
});

/** POST /password/request — forgot password. Body: { email }. Always 200 { ok: true }. */
router.post('/password/request', async (req, res, next) => {
  try {
    const { email } = req.body ?? {};
    await requestPasswordReset({ email });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** POST /password/reset — reset with token. Body: { email, token, newPassword }. Returns { ok: true, token? }. */
router.post('/password/reset', async (req, res, next) => {
  try {
    const { email, token, newPassword } = req.body ?? {};
    const result = await resetPassword({ email, token, newPassword });
    res.json(result);
  } catch (err) {
    if (err.code === 'INVALID_INPUT') {
      return res.status(400).json({ ok: false, error: err.message, message: err.message });
    }
    if (err.code === 'INVALID_OR_EXPIRED_TOKEN' || err.code === 'TOKEN_EMAIL_MISMATCH') {
      return res.status(400).json({ ok: false, error: err.message, message: err.message });
    }
    next(err);
  }
});

/** POST /auth/google — OAuth not implemented in core; 501. */
router.post('/auth/google', (req, res) => {
  res.status(501).json({
    ok: false,
    code: 'OAUTH_NOT_CONFIGURED',
    message: 'OAuth login not configured in cardbey-core yet.',
  });
});

/** POST /auth/facebook — OAuth not implemented in core; 501. */
router.post('/auth/facebook', (req, res) => {
  res.status(501).json({
    ok: false,
    code: 'OAUTH_NOT_CONFIGURED',
    message: 'OAuth login not configured in cardbey-core yet.',
  });
});

export default router;
