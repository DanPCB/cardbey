/**
 * Meta OAuth callback for social posting (Method B).
 * External Connections: persists OAuthConnection (push) — see lib/externalConnections.
 * Mount at /api/oauth — see server.js
 */

import express from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { encryptToken } from '../lib/tokenCrypto.js';
import { PRISMA_OAUTH_PLATFORM } from '../lib/externalConnections/providers.js';

const router = express.Router();

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT = process.env.FACEBOOK_REDIRECT_URI;

function dashboardOrigin() {
  return String(process.env.DASHBOARD_URL ?? 'http://localhost:5174').replace(/\/$/, '');
}

// GET /api/oauth/facebook/callback
router.get('/facebook/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.warn('[OAuthCallback] Facebook denied:', oauthError);
    return res.redirect(`${dashboardOrigin()}/app?oauth=denied&platform=facebook`);
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

  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET || !FACEBOOK_REDIRECT) {
    console.error('[OAuthCallback] Missing FACEBOOK_APP_ID / SECRET / REDIRECT_URI');
    return res.redirect(`${dashboardOrigin()}/app?oauth=error&platform=facebook`);
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
    return res.redirect(`${dashboardOrigin()}/app?oauth=error&platform=facebook`);
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
    return res.redirect(`${dashboardOrigin()}/app?oauth=no_pages&platform=facebook`);
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
    `${dashboardOrigin()}/app?oauth=success&platform=facebook&page=${encodeURIComponent(page.name ?? '')}`,
  );
});

export default router;
