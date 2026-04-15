/**
 * Resolve a valid Google OAuth access token for a user from OAuthConnection (platform google).
 * Refreshes using refresh_token when expiresAt is past, if GOOGLE_OAUTH_CLIENT_ID/SECRET are set.
 */

import { getPrismaClient } from '../prisma.js';
import { decryptToken, encryptToken } from '../tokenCrypto.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * @param {{ id: string, accessToken: string, refreshToken: string | null, expiresAt: Date | null }} connection
 * @returns {Promise<{ accessToken: string } | { error: { code: string, message: string } }>}
 */
async function refreshIfNeeded(connection) {
  let access = '';
  try {
    access = decryptToken(connection.accessToken);
  } catch (e) {
    return { error: { code: 'TOKEN_DECRYPT_FAILED', message: e?.message || 'decrypt_failed' } };
  }

  const now = Date.now();
  const exp = connection.expiresAt ? connection.expiresAt.getTime() : 0;
  const bufferMs = 60_000;
  const notExpired = exp > 0 && now < exp - bufferMs;
  if (notExpired && access) {
    return { accessToken: access };
  }

  if (!connection.refreshToken) {
    if (access) {
      return { accessToken: access };
    }
    return { error: { code: 'GOOGLE_TOKEN_EXPIRED', message: 'Missing or empty access token and no refresh token' } };
  }

  const clientId = String(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(
    process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  ).trim();
  if (!clientId || !clientSecret) {
    if (access) return { accessToken: access };
    return {
      error: {
        code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
        message:
          'Token expired; set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to enable refresh, or reconnect Google.',
      },
    };
  }

  let refreshPlain = '';
  try {
    refreshPlain = decryptToken(connection.refreshToken);
  } catch (e) {
    return { error: { code: 'TOKEN_DECRYPT_FAILED', message: e?.message || 'refresh_decrypt_failed' } };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshPlain,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    return { error: { code: 'GOOGLE_REFRESH_FAILED', message: String(msg) } };
  }

  const newAccess = data.access_token;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const prisma = getPrismaClient();

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptToken(newAccess),
      expiresAt,
      ...(typeof data.refresh_token === 'string' && data.refresh_token
        ? { refreshToken: encryptToken(data.refresh_token) }
        : {}),
    },
  });

  return { accessToken: newAccess };
}

/**
 * @param {string} userId
 * @returns {Promise<{ accessToken: string, connection: object } | { error: { code: string, message: string } }>}
 */
export async function resolveGoogleAccessTokenForUser(userId) {
  const uid = String(userId || '').trim();
  if (!uid) {
    return { error: { code: 'USER_ID_REQUIRED', message: 'userId is required' } };
  }

  const prisma = getPrismaClient();
  const connection = await prisma.oAuthConnection.findFirst({
    where: { userId: uid, platform: 'google' },
    orderBy: { updatedAt: 'desc' },
  });

  if (!connection) {
    return {
      error: {
        code: 'GOOGLE_NOT_CONNECTED',
        message:
          'No Google account linked. Store an OAuthConnection with platform "google" and Calendar scope (https://www.googleapis.com/auth/calendar.events).',
      },
    };
  }

  const refreshed = await refreshIfNeeded(connection);
  if (refreshed.error) return refreshed;
  return { accessToken: refreshed.accessToken, connection };
}
