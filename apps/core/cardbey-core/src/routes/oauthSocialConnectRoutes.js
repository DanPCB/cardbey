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
import {
  facebookConfigured,
  zaloConfigured,
  buildMetaOAuthUrl,
  buildZaloOAuthUrl,
  META_FB_SCOPES,
  upsertInstagramFromFacebookPage,
  exchangeZaloCode,
} from '../services/social/socialConnectService.js';

const router = express.Router();

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET;
const FACEBOOK_REDIRECT = process.env.FACEBOOK_REDIRECT_URI;
const ZALO_APP_ID = process.env.ZALO_APP_ID;
const ZALO_REDIRECT = process.env.ZALO_REDIRECT_URI;

function dashboardOrigin() {
  return String(process.env.DASHBOARD_URL ?? 'http://localhost:5174').replace(/\/$/, '');
}

function integrationsRedirect(suffix) {
  return `${dashboardOrigin()}/settings/integrations${suffix}`;
}

async function oauthStatusForPlatform(req, res, platform) {
  try {
    const configured = platform === 'zalo' ? zaloConfigured() : facebookConfigured();
    if (!configured) {
      return res.json({
        ok: false,
        configured: false,
        connected: false,
        status: 'NOT_CONFIGURED',
        platform,
        error: `${platform}_oauth_not_configured`,
      });
    }

    if (req.user?.role === 'guest') {
      return res.status(403).json({
        ok: false,
        error: 'guest_forbidden',
        connected: false,
        status: 'NOT_CONNECTED',
        platform,
      });
    }

    const userId = String(req.user?.id ?? '').trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const prisma = getPrismaClient();
    const conn = await prisma.oAuthConnection.findFirst({
      where: { userId, platform },
      orderBy: { updatedAt: 'desc' },
      select: { pageId: true, pageName: true, scopes: true, expiresAt: true, updatedAt: true },
    });

    return res.json({
      ok: true,
      configured: true,
      connected: Boolean(conn),
      status: conn ? 'ACTIVE' : 'NOT_CONNECTED',
      platform,
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
    console.error(`[OAuth${platform}] status error:`, err?.message || err);
    return res.status(500).json({ ok: false, error: 'status_failed', platform });
  }
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
  try {
    const oauthUrl = buildMetaOAuthUrl({
      userId,
      storeId,
      platform: 'facebook',
    });
    return res.redirect(oauthUrl);
  } catch {
    return res.status(503).json({
      ok: false,
      error: 'facebook_oauth_not_configured',
      message: 'Set FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI.',
    });
  }
});

// GET /api/oauth/instagram/connect — same Meta OAuth (Instagram linked via Page)
router.get('/instagram/connect', requireAuth, (req, res) => {
  if (!facebookConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'facebook_oauth_not_configured',
      message: 'Instagram uses Meta OAuth. Configure FACEBOOK_APP_ID and FACEBOOK_REDIRECT_URI.',
    });
  }

  if (req.user?.role === 'guest') {
    return res.status(403).json({
      ok: false,
      error: 'guest_forbidden',
      message: 'Guest sessions cannot connect Instagram. Sign in with a full account.',
    });
  }

  const userId = String(req.user?.id ?? '').trim();
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const storeId = String(req.query.storeId ?? '').trim() || null;
  try {
    const oauthUrl = buildMetaOAuthUrl({
      userId,
      storeId,
      platform: 'instagram',
    });
    return res.redirect(oauthUrl);
  } catch {
    return res.status(503).json({ ok: false, error: 'facebook_oauth_not_configured' });
  }
});

// GET /api/oauth/zalo/connect
router.get('/zalo/connect', requireAuth, (req, res) => {
  if (!zaloConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'zalo_oauth_not_configured',
      message: 'Set ZALO_APP_ID, ZALO_APP_SECRET, and ZALO_REDIRECT_URI.',
    });
  }

  if (req.user?.role === 'guest') {
    return res.status(403).json({
      ok: false,
      error: 'guest_forbidden',
      message: 'Guest sessions cannot connect Zalo. Sign in with a full account.',
    });
  }

  const userId = String(req.user?.id ?? '').trim();
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const storeId = String(req.query.storeId ?? '').trim() || null;
  try {
    const oauthUrl = buildZaloOAuthUrl({ userId, storeId });
    return res.redirect(oauthUrl);
  } catch {
    return res.status(503).json({ ok: false, error: 'zalo_oauth_not_configured' });
  }
});

// GET /api/oauth/facebook/status
router.get('/facebook/status', requireAuth, (req, res) =>
  oauthStatusForPlatform(req, res, PRISMA_OAUTH_PLATFORM.FACEBOOK),
);

// GET /api/oauth/instagram/status
router.get('/instagram/status', requireAuth, (req, res) =>
  oauthStatusForPlatform(req, res, PRISMA_OAUTH_PLATFORM.INSTAGRAM),
);

// GET /api/oauth/zalo/status
router.get('/zalo/status', requireAuth, (req, res) => oauthStatusForPlatform(req, res, 'zalo'));

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

// POST /api/oauth/instagram/revoke
router.post('/instagram/revoke', requireAuth, async (req, res) => {
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
      where: { userId, platform: PRISMA_OAUTH_PLATFORM.INSTAGRAM },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[OAuthInstagram] revoke error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'revoke_failed' });
  }
});

// POST /api/oauth/zalo/revoke
router.post('/zalo/revoke', requireAuth, async (req, res) => {
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
      where: { userId, platform: 'zalo' },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[OAuthZalo] revoke error:', err?.message || err);
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
  const redirectPlatform = String(stateData.platform ?? 'facebook').trim().toLowerCase() || 'facebook';
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
      scopes: META_FB_SCOPES,
      expiresAt,
    },
  });

  await upsertInstagramFromFacebookPage({
    userId,
    pageId: String(page.id),
    pageAccessToken,
    pageName: page.name ?? null,
  });

  console.log(`[OAuthCallback] Facebook connected: userId=${userId} page="${page.name ?? page.id}"`);

  return res.redirect(
    integrationsRedirect(
      `?oauth=success&platform=${encodeURIComponent(redirectPlatform)}&page=${encodeURIComponent(page.name ?? '')}`,
    ),
  );
});

// GET /api/oauth/zalo/callback
router.get('/zalo/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.warn('[OAuthCallback] Zalo denied:', oauthError);
    return res.redirect(integrationsRedirect('?oauth=denied&platform=zalo'));
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

  if (!zaloConfigured()) {
    return res.redirect(integrationsRedirect('?oauth=error&platform=zalo'));
  }

  try {
    const tokenData = await exchangeZaloCode(String(code));
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000)
      : null;

    const prisma = getPrismaClient();
    const oaId = tokenData.oa_id != null ? String(tokenData.oa_id) : 'default';

    await prisma.oAuthConnection.upsert({
      where: {
        userId_platform_pageId: {
          userId,
          platform: 'zalo',
          pageId: oaId,
        },
      },
      update: {
        accessToken: encryptToken(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        userId,
        platform: 'zalo',
        accessToken: encryptToken(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
        pageId: oaId,
        pageName: tokenData.oa_name ?? null,
        scopes: 'profile,post',
        expiresAt,
      },
    });

    console.log(`[OAuthCallback] Zalo connected: userId=${userId}`);
    return res.redirect(integrationsRedirect('?oauth=success&platform=zalo'));
  } catch (err) {
    console.error('[OAuthCallback] Zalo token exchange failed:', err?.message ?? err);
    return res.redirect(integrationsRedirect('?oauth=error&platform=zalo'));
  }
});

export default router;
