/**
 * SSE stream authentication — env stream key, dev admin key, session JWT, or agent-chat streamToken.
 * EventSource cannot send Authorization headers; JWT may be passed as ?token=.
 * agent-chat: streamToken + missionId verified upstream by verifyAgentChatStreamToken middleware.
 */

import jwt from 'jsonwebtoken';
import { requireJwtSecret } from '../lib/security/requireJwtSecret.js';

export function looksLikeJwt(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.trim().split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function verifySseJwt(token) {
  try {
    const decoded = jwt.verify(token, requireJwtSecret());
    const userId = decoded.userId || decoded.sub;
    if (!userId) return { ok: false };
    return { ok: true, userId: String(userId) };
  } catch {
    return { ok: false };
  }
}

function isStagingDeploy() {
  return (
    process.env.CARDEY_DEPLOY_ENV === 'staging' ||
    String(process.env.RENDER_SERVICE_NAME || '').toLowerCase().includes('staging')
  );
}

/** User-facing hint for 403 SSE responses (no secrets). */
export function sseStreamAuthHint(error) {
  const staging = isStagingDeploy();
  if (error === 'legacy_admin_key_disabled') {
    return staging
      ? 'Legacy key=admin is disabled on staging. Sign in to the dashboard (JWT ?token=) or set SSE_STREAM_KEY on Core and VITE_SSE_STREAM_KEY on the dashboard build.'
      : 'Legacy key=admin is disabled in production. Sign in (JWT ?token=) or configure SSE_STREAM_KEY.';
  }
  if (error === 'unauthorized_stream') {
    return staging
      ? 'Invalid stream key. Sign in for JWT auth, or use ?key= matching SSE_STREAM_KEY.'
      : 'Invalid stream key. Sign in for JWT auth or configure SSE_STREAM_KEY.';
  }
  if (error === 'invalid_jwt') {
    return 'Session expired or invalid. Sign in again to reconnect live device events.';
  }
  if (error === 'mission_id_required') {
    return 'missionId is required for agent-chat stream.';
  }
  return 'Valid stream token or SSE_STREAM_KEY required.';
}

/**
 * Resolve whether an SSE connection may proceed and which broadcast key to use.
 * Device/admin broadcasts use clientKey `admin` after JWT auth.
 *
 * @param {import('express').Request} req
 * @returns {{ ok: true, clientKey: string, authMode: string, userId?: string } | { ok: false, error: string }}
 */
export function resolveSseStreamAuth(req) {
  const rawKey = String(req.query?.key ?? 'admin').trim() || 'admin';
  const tokenParam = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  const jwtToken = tokenParam || (looksLikeJwt(rawKey) ? rawKey : '');

  const missionId =
    typeof req.query?.missionId === 'string' && req.query.missionId.trim()
      ? req.query.missionId.trim()
      : null;

  // Mission console SSE — streamToken verified by verifyAgentChatStreamToken before handleSse.
  if (rawKey === 'agent-chat') {
    if (!missionId) {
      return { ok: false, error: 'mission_id_required' };
    }
    return { ok: true, clientKey: 'agent-chat', authMode: 'stream-token', missionId };
  }

  const envKey = process.env.SSE_STREAM_KEY || process.env.TV_STREAM_KEY;
  if (envKey && rawKey === envKey) {
    return { ok: true, clientKey: rawKey, authMode: 'env' };
  }

  // Public engagement channels — no auth (aggregate counts only, no PII).
  if (rawKey === 'public-feed' || rawKey.startsWith('store:')) {
    return { ok: true, clientKey: rawKey, authMode: 'public-engagement' };
  }

  if (rawKey.startsWith('owner-store:') && jwtToken) {
    const verified = verifySseJwt(jwtToken);
    if (verified.ok) {
      return { ok: true, clientKey: rawKey, authMode: 'owner-engagement', userId: verified.userId };
    }
  }

  if (jwtToken) {
    const verified = verifySseJwt(jwtToken);
    if (verified.ok) {
      return {
        ok: true,
        clientKey: 'admin',
        authMode: 'jwt',
        userId: verified.userId,
      };
    }
    if (tokenParam) {
      return { ok: false, error: 'invalid_jwt' };
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    if (rawKey === 'admin' || rawKey === 'public') {
      return { ok: true, clientKey: rawKey, authMode: 'dev' };
    }
    return { ok: true, clientKey: rawKey, authMode: 'dev-key' };
  }

  if (rawKey === 'admin') {
    return { ok: false, error: 'legacy_admin_key_disabled' };
  }

  return { ok: false, error: 'unauthorized_stream' };
}
