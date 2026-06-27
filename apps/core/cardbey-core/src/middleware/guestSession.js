/**
 * Guest session ID for unauthenticated draft creation and claim flow.
 * Sets req.guestSessionId from cookie "guestSessionId" or header "X-Guest-Session".
 * If missing, creates a UUID and sets the cookie (httpOnly, cross-site SameSite=None on HTTPS prod/staging).
 */

import crypto from 'crypto';
import { extractGuestUserIdFromBearer } from './auth.js';

const COOKIE_NAME = 'guestSessionId';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function randomUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

/**
 * SameSite=None requires Secure=true. Use on HTTPS staging/production cross-site deploys
 * (dashboard and core on different origins, e.g. *.onrender.com).
 * Plain localhost HTTP keeps Lax without Secure.
 */
export function shouldUseCrossSiteGuestCookie() {
  const explicit = process.env.GUEST_COOKIE_SAMESITE?.trim().toLowerCase();
  if (explicit === 'none') return true;
  if (explicit === 'lax' || explicit === 'strict') return false;

  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  const deployEnv = process.env.CARDEY_DEPLOY_ENV?.trim().toLowerCase();

  if (deployEnv === 'staging' || deployEnv === 'production') return true;
  if (nodeEnv === 'production' || nodeEnv === 'staging') return true;

  return false;
}

export function buildGuestCookieOptions() {
  const crossSite = shouldUseCrossSiteGuestCookie();
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
    maxAge: MAX_AGE_MS,
  };
}

function setGuestSessionCookie(res, id) {
  res.cookie(COOKIE_NAME, id, buildGuestCookieOptions());
  res.setHeader('X-Guest-Session', id);
}

/**
 * Middleware: ensure req.guestSessionId is set.
 * Reads from req.cookies.guestSessionId or req.headers['x-guest-session'].
 * If missing, generates a new ID and sets the cookie on res.
 */
export function guestSessionId(req, res, next) {
  const bearerGuestUserId = extractGuestUserIdFromBearer(req);
  if (bearerGuestUserId) {
    const principal = bearerGuestUserId.startsWith('guest_')
      ? bearerGuestUserId
      : `guest_${bearerGuestUserId}`;
    req.guestPrincipalUserId = principal;
    req.guestSessionId = principal.startsWith('guest_') ? principal.slice(6) : principal;
    return next();
  }

  const fromCookie = req.cookies?.[COOKIE_NAME];
  const fromHeader = req.headers['x-guest-session']?.trim?.() || null;

  if (!fromCookie && !fromHeader) {
    console.warn('[guest-session] cookie_missing', {
      path: req.path,
      method: req.method,
    });
  } else if (!fromCookie && fromHeader) {
    console.warn('[guest-session] cookie_rejected_possible_cross_site', {
      path: req.path,
      method: req.method,
      hasHeader: true,
    });
  }

  let id = fromCookie || fromHeader;
  if (id) {
    req.guestSessionId = id;
    req.guestPrincipalUserId = id.startsWith('guest_') ? id : `guest_${id}`;
    if (!fromCookie && fromHeader) {
      setGuestSessionCookie(res, id);
    } else if (fromCookie && shouldUseCrossSiteGuestCookie()) {
      setGuestSessionCookie(res, id);
    }
    return next();
  }

  id = randomUuid();
  req.guestSessionId = id;
  req.guestPrincipalUserId = `guest_${id}`;
  console.log('[guest-session] created_new_guest_session', {
    path: req.path,
    method: req.method,
  });
  setGuestSessionCookie(res, id);
  next();
}
