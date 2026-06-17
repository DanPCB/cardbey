/**
 * SSE stream authentication — env stream key, dev admin key, or session JWT.
 * EventSource cannot send Authorization headers; JWT may be passed as ?token=.
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

  const envKey = process.env.SSE_STREAM_KEY || process.env.TV_STREAM_KEY;
  if (envKey && rawKey === envKey) {
    return { ok: true, clientKey: rawKey, authMode: 'env' };
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
