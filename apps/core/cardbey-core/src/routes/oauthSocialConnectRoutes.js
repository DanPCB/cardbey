/**
 * Meta OAuth for social posting (Method B).
 * External Connections: persists OAuthConnection (push) — see lib/externalConnections.
 * Mount at /api/oauth — see server.js
 *
 * Routes:
 *   GET  /api/oauth/facebook/connect   → redirect to Meta consent (requireAuth; ?token= JWT supported)
 *   GET  /api/oauth/facebook/callback  → exchange code, upsert OAuthConnection
 *   GET  /api/oauth/facebook/status    → connection status for authenticated user
 *   POST /api/oauth/facebook/revoke    → delete OAuthConnection rows for facebook
 */

import express from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { encryptToken } from '../lib/tokenCrypto.js';
import { PRISMA_OAUTH_PLATFORM } from '../lib/externalConnections/providers.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET;
const FACEBOOK_REDIRECT = process.env.FACEBOOK_REDIRECT_URI;

const FB_SCOPES = ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'].join(',');

function dashboardOrigin() {
  return String(process.env.DASHBOARD_URL ?? 'http://localhost:5174').replace(/\/$/, '');
}

function integrationsRedirect(suffix) {
  return `${dashboardOrigin()}/settings/integrations${suffix}`;
}

function facebookConfigured() {
  return Boolean(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET && FACEBOOK_REDIRECT);
}

// GET /api/oauth/facebook/connect
router.get('/facebook/connect', requireAuth, (req, res) => {
  if (!facebookConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'facebook_oauth_not_configured',
      message: 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET (or FACEBOOK_CLIENT_* aliases) and FACEBOOK_REDIRECT_URI.',
    });
  }

  if (req.user?.role === 'guest') {
    return res.status(403).json({
      ok: false,
      error: 'guest_forbidden',
      message: 'Guest sessions cannot connect Facebook. Sign in with a full account.',
    });
  }

  const userId = String(req.user?.id ?? '').trim();
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const storeId = String(req.query.storeId ?? '').trim() || null;
  const state = Buffer.from(JSON.stringify({ userId, storeId, platform: 'facebook' })).toString('base64');
  const oauthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  oauthUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  oauthUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT);
  oauthUrl.searchParams.set('scope', FB_SCOPES);
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('state', state);

  return res.redirect(oauthUrl.toString());
});

// GET /api/oauth/facebook/status
router.get('/facebook/status', requireAuth, async (req, res) => {
  try {
    if (!facebookConfigured()) {
      return res.json({
        ok: false,
        configured: false,
        connected: false,
        status: 'NOT_CONFIGURED',
        error: 'facebook_oauth_not_configured',
      });
    }

    if (req.user?.role === 'guest') {
      return res.status(403).json({
        ok: false,
        error: 'guest_forbidden',
        connected: false,
        status: 'NOT_CONNECTED',
      });
    }

    const userId = String(req.user?.id ?? '').trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const prisma = getPrismaClient();
    const conn = await prisma.oAuthConnection.findFirst({
      where: { userId, platform: PRISMA_OAUTH_PLATFORM.FACEBOOK },
      orderBy: { updatedAt: 'desc' },
      select: { pageId: true, pageName: true, scopes: true, expiresAt: true, updatedAt: true },
    });

    return res.json({
      ok: true,
      configured: true,
      connected: Boolean(conn),
      status: conn ? 'ACTIVE' : 'NOT_CONNECTED',
      pageId: conn?.pageId ?? null,
      pageName: conn?.pageName ?? null,
      scopes: conn?.scopes
        ? conn.scopes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      expiresAt: conn?.expiresAt ?? null,
      lastUsedAt: conn?.updatedAt ?? null,
    });
  } catch (err) {
    console.error('[OAuthFacebook] status error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'status_failed' });
  }
});

// POST /api/oauth/facebook/revoke
router.post('/facebook/revoke', requireAuth, async (req, res) => {
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
      where: { userId, platform: PRISMA_OAUTH_PLATFORM.FACEBOOK },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[OAuthFacebook] revoke error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'revoke_failed' });
  }
});

// GET /api/oauth/facebook/callback
router.get('/facebook/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.warn('[OAuthCallback] Facebook denied:', oauthError);
    return res.redirect(integrationsRedirect('?oauth=denied&platform=facebook'));
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'missing_code_or_state' });
  }

  let stateData;
  try {
    stateData = JSON.parse(Buffer.from(String(state), 'base64').toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'invalid_state' });
  }
  const userId = String(stateData.userId ?? '').trim();
  if (!userId) {
    return res.status(400).json({ error: 'invalid_state_user' });
  }

  if (!facebookConfigured()) {
    console.error('[OAuthCallback] Missing FACEBOOK_APP_ID / SECRET / REDIRECT_URI');
    return res.redirect(integrationsRedirect('?oauth=error&platform=facebook'));
  }

  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${FACEBOOK_APP_ID}` +
      `&client_secret=${FACEBOOK_APP_SECRET}` +
      `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT)}` +
      `&code=${encodeURIComponent(String(code))}`,
  );
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error('[OAuthCallback] Token exchange failed:', tokenData);
    return res.redirect(integrationsRedirect('?oauth=error&platform=facebook'));
  }

  const llRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${FACEBOOK_APP_ID}` +
      `&client_secret=${FACEBOOK_APP_SECRET}` +
      `&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`,
  );
  const llData = await llRes.json();
  const longToken = llData.access_token ?? tokenData.access_token;

  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(longToken)}`,
  );
  const pagesData = await pagesRes.json();
  const pages = Array.isArray(pagesData.data) ? pagesData.data : [];

  if (!pages.length) {
    return res.redirect(integrationsRedirect('?oauth=no_pages&platform=facebook'));
  }

  const page = pages[0];
  const pageAccessToken = page.access_token ?? longToken;

  const expiresAt = llData.expires_in ? new Date(Date.now() + llData.expires_in * 1000) : null;

  const prisma = getPrismaClient();
  await prisma.oAuthConnection.upsert({
    where: {
      userId_platform_pageId: {
        userId,
        platform: PRISMA_OAUTH_PLATFORM.FACEBOOK,
        pageId: String(page.id),
      },
    },
    update: {
      accessToken: encryptToken(pageAccessToken),
      pageName: page.name ?? null,
      expiresAt,
      updatedAt: new Date(),
    },
    create: {
      userId,
      platform: PRISMA_OAUTH_PLATFORM.FACEBOOK,
      accessToken: encryptToken(pageAccessToken),
      pageId: String(page.id),
      pageName: page.name ?? null,
      scopes: 'pages_manage_posts,pages_read_engagement',
      expiresAt,
    },
  });

  console.log(`[OAuthCallback] Facebook connected: userId=${userId} page="${page.name ?? page.id}"`);

  return res.redirect(
    integrationsRedirect(
      `?oauth=success&platform=facebook&page=${encodeURIComponent(page.name ?? '')}`,
    ),
  );
});

export default router;
