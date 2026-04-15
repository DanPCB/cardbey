/**
 * Google OAuth (Authorization Code + PKCE) for Calendar (and future Gmail).
 * Mount at /api/oauth — see server.js
 *
 * Routes:
 *   GET  /api/oauth/google/connect   → redirect to Google consent (requireAuth; ?token= JWT supported)
 *   GET  /api/oauth/google/callback  → exchange code, upsert OAuthConnection (no Bearer; state carries userId + PKCE)
 *   GET  /api/oauth/google/status    → connection status for authenticated user
 *   POST /api/oauth/google/revoke    → delete OAuthConnection rows for google
 */

import express from 'express';
import crypto from 'node:crypto';
import { getPrismaClient } from '../lib/prisma.js';
import { encryptToken } from '../lib/tokenCrypto.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/** Stable pageId for @@unique([userId, platform, pageId]) — not a Facebook page id. */
const GOOGLE_OAUTH_PAGE_ID = 'google_calendar';

function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
}

function googleClientSecret() {
  return String(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
}

function googleRedirectUri() {
  const u = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (u) return u;
  return 'http://localhost:4000/api/oauth/google/callback';
}

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
].join(' ');

function dashboardOrigin() {
  return String(process.env.DASHBOARD_URL ?? 'http://localhost:5174').replace(/\/$/, '');
}

function integrationsRedirect(suffix) {
  return `${dashboardOrigin()}/settings/integrations${suffix}`;
}

function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeState(raw) {
  try {
    const s = String(raw ?? '');
    if (!s) return null;
    return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// ── GET /api/oauth/google/connect ───────────────────────────────────────────
router.get('/google/connect', requireAuth, (req, res) => {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  const redirectUri = googleRedirectUri();

  if (!clientId || !clientSecret) {
    return res.status(503).json({
      ok: false,
      error: 'google_oauth_not_configured',
      message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or GOOGLE_OAUTH_* aliases).',
    });
  }

  if (req.user?.role === 'guest') {
    return res.status(403).json({
      ok: false,
      error: 'guest_forbidden',
      message: 'Guest sessions cannot connect Google. Sign in with a full account.',
    });
  }

  const userId = String(req.user?.id ?? '').trim();
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');

  const state = encodeState({
    v: 1,
    userId,
    cv: codeVerifier,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── GET /api/oauth/google/callback ─────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, state: stateRaw, error: oauthError } = req.query;

  if (oauthError) {
    console.warn('[OAuthGoogle] denied:', oauthError);
    return res.redirect(integrationsRedirect('?error=google_denied'));
  }

  const stateData = decodeState(stateRaw);
  if (!stateData || stateData.v !== 1 || !stateData.userId || !stateData.cv) {
    return res.redirect(integrationsRedirect('?error=google_failed'));
  }

  const userId = String(stateData.userId).trim();
  const codeVerifier = String(stateData.cv);

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  const redirectUri = googleRedirectUri();

  if (!clientId || !clientSecret || !code) {
    return res.redirect(integrationsRedirect('?error=google_failed'));
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }).toString(),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      console.error('[OAuthGoogle] token exchange failed:', tokens);
      return res.redirect(integrationsRedirect('?error=google_failed'));
    }

    const prisma = getPrismaClient();
    const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const scopesCsv = GOOGLE_SCOPES.split(/\s+/).filter(Boolean).join(',');

    const refreshPlain = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null;

    await prisma.oAuthConnection.upsert({
      where: {
        userId_platform_pageId: {
          userId,
          platform: 'google',
          pageId: GOOGLE_OAUTH_PAGE_ID,
        },
      },
      create: {
        userId,
        platform: 'google',
        pageId: GOOGLE_OAUTH_PAGE_ID,
        pageName: 'Google (Calendar)',
        accessToken: encryptToken(tokens.access_token),
        refreshToken: refreshPlain ? encryptToken(refreshPlain) : null,
        scopes: scopesCsv,
        expiresAt,
      },
      update: {
        accessToken: encryptToken(tokens.access_token),
        ...(refreshPlain ? { refreshToken: encryptToken(refreshPlain) } : {}),
        scopes: scopesCsv,
        expiresAt,
        pageName: 'Google (Calendar)',
        updatedAt: new Date(),
      },
    });

    return res.redirect(integrationsRedirect('?connected=google'));
  } catch (err) {
    console.error('[OAuthGoogle] callback error:', err?.message || err);
    return res.redirect(integrationsRedirect('?error=google_failed'));
  }
});

// ── GET /api/oauth/google/status ────────────────────────────────────────────
router.get('/google/status', requireAuth, async (req, res) => {
  try {
    if (req.user?.role === 'guest') {
      return res.status(403).json({
        ok: false,
        error: 'guest_forbidden',
        connected: false,
        status: 'NOT_CONNECTED',
        scopes: [],
      });
    }

    const userId = String(req.user?.id ?? '').trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const prisma = getPrismaClient();
    const conn = await prisma.oAuthConnection.findFirst({
      where: { userId, platform: 'google', pageId: GOOGLE_OAUTH_PAGE_ID },
      select: { scopes: true, expiresAt: true, updatedAt: true, pageId: true },
    });

    const scopeList = conn?.scopes
      ? conn.scopes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return res.json({
      ok: true,
      connected: Boolean(conn),
      status: conn ? 'ACTIVE' : 'NOT_CONNECTED',
      scopes: scopeList,
      expiresAt: conn?.expiresAt ?? null,
      lastUsedAt: conn?.updatedAt ?? null,
    });
  } catch (err) {
    console.error('[OAuthGoogle] status error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'status_failed' });
  }
});

// ── POST /api/oauth/google/revoke ───────────────────────────────────────────
router.post('/google/revoke', requireAuth, async (req, res) => {
  try {
    if (req.user?.role === 'guest') {
      return res.status(403).json({ ok: false, error: 'guest_forbidden' });
    }

    const userId = String(req.user?.id ?? '').trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const prisma = getPrismaClient();
    await prisma.oAuthConnection.deleteMany({
      where: { userId, platform: 'google' },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[OAuthGoogle] revoke error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'revoke_failed' });
  }
});

export default router;
