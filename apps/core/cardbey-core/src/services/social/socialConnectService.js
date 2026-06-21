/**
 * Social OAuth helpers — Meta (Facebook/Instagram) + Zalo OA.
 * Token persistence uses OAuthConnection (see oauthSocialConnectRoutes.js).
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { PRISMA_OAUTH_PLATFORM } from '../../lib/externalConnections/providers.js';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID;
const FACEBOOK_REDIRECT = process.env.FACEBOOK_REDIRECT_URI;

const ZALO_APP_ID = process.env.ZALO_APP_ID;
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET;
const ZALO_REDIRECT = process.env.ZALO_REDIRECT_URI;

export const META_FB_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
].join(',');

export function facebookConfigured() {
  return Boolean(FACEBOOK_APP_ID && FACEBOOK_REDIRECT);
}

export function zaloConfigured() {
  return Boolean(ZALO_APP_ID && ZALO_APP_SECRET && ZALO_REDIRECT);
}

/**
 * @param {{ userId: string, storeId?: string | null, platform: string }} params
 */
export function buildMetaOAuthUrl({ userId, storeId = null, platform }) {
  if (!facebookConfigured()) {
    throw new Error('facebook_not_configured');
  }
  const state = Buffer.from(JSON.stringify({ userId, storeId, platform })).toString('base64');
  const oauthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  oauthUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  oauthUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT);
  oauthUrl.searchParams.set('scope', META_FB_SCOPES);
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('state', state);
  return oauthUrl.toString();
}

/**
 * @param {{ userId: string, storeId?: string | null }} params
 */
export function buildZaloOAuthUrl({ userId, storeId = null }) {
  if (!zaloConfigured()) {
    throw new Error('zalo_not_configured');
  }
  const state = Buffer.from(JSON.stringify({ userId, storeId, platform: 'zalo' })).toString('base64');
  const oauthUrl = new URL('https://oauth.zaloapp.com/v4/permission');
  oauthUrl.searchParams.set('app_id', ZALO_APP_ID);
  oauthUrl.searchParams.set('redirect_uri', ZALO_REDIRECT);
  oauthUrl.searchParams.set('state', state);
  return oauthUrl.toString();
}

/**
 * @param {string} userId
 * @param {string} platform — facebook | instagram | zalo
 */
export async function isUserConnected(userId, platform) {
  const uid = String(userId ?? '').trim();
  const p = String(platform ?? '').trim().toLowerCase();
  if (!uid || !p) return false;

  const prisma = getPrismaClient();
  const conn = await prisma.oAuthConnection.findFirst({
    where: { userId: uid, platform: p },
    select: { id: true },
  });
  return Boolean(conn);
}

/**
 * @param {string} userId
 * @param {string} platform
 */
export async function getUserConnection(userId, platform) {
  const uid = String(userId ?? '').trim();
  const p = String(platform ?? '').trim().toLowerCase();
  if (!uid || !p) return null;

  const prisma = getPrismaClient();
  return prisma.oAuthConnection.findFirst({
    where: { userId: uid, platform: p },
    orderBy: { updatedAt: 'desc' },
  });
}

/**
 * Discover Instagram Business account linked to a Facebook Page and upsert OAuthConnection.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.pageId
 * @param {string} params.pageAccessToken
 * @param {string | null} [params.pageName]
 */
export async function upsertInstagramFromFacebookPage({ userId, pageId, pageAccessToken, pageName }) {
  try {
    const fields = 'instagram_business_account{id,username}';
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`,
    );
    const data = await res.json();
    const ig = data?.instagram_business_account;
    if (!ig?.id) return null;

    const { encryptToken } = await import('../../lib/tokenCrypto.js');
    const prisma = getPrismaClient();
    await prisma.oAuthConnection.upsert({
      where: {
        userId_platform_pageId: {
          userId,
          platform: PRISMA_OAUTH_PLATFORM.INSTAGRAM,
          pageId: String(ig.id),
        },
      },
      update: {
        accessToken: encryptToken(pageAccessToken),
        pageName: ig.username ?? pageName ?? null,
        updatedAt: new Date(),
      },
      create: {
        userId,
        platform: PRISMA_OAUTH_PLATFORM.INSTAGRAM,
        accessToken: encryptToken(pageAccessToken),
        pageId: String(ig.id),
        pageName: ig.username ?? pageName ?? null,
        scopes: 'instagram_basic,instagram_content_publish',
      },
    });

    return { igUserId: String(ig.id), username: ig.username ?? null };
  } catch (err) {
    console.warn('[socialConnect] Instagram discovery failed (non-fatal):', err?.message ?? err);
    return null;
  }
}

/**
 * Exchange Zalo authorization code for access token.
 * @param {string} code
 */
export async function exchangeZaloCode(code) {
  if (!zaloConfigured()) {
    throw new Error('zalo_not_configured');
  }

  const res = await fetch('https://oauth.zaloapp.com/v4/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: ZALO_APP_SECRET,
    },
    body: new URLSearchParams({
      code: String(code),
      app_id: ZALO_APP_ID,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.message ?? 'zalo_token_exchange_failed');
  }
  return data;
}
