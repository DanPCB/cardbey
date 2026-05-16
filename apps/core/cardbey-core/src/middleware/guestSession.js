/**
 * Guest session ID for unauthenticated draft creation and claim flow.
 * Sets req.guestSessionId from cookie "guestSessionId" or header "X-Guest-Session".
 * If missing, creates a UUID and sets the cookie (httpOnly, sameSite: Lax, secure in prod).
 */

import crypto from 'crypto';

const COOKIE_NAME = 'guestSessionId';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function randomUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Middleware: ensure req.guestSessionId is set.
 * Reads from req.cookies.guestSessionId or req.headers['x-guest-session'].
 * If missing, generates a new ID and sets the cookie on res.
 */
export function guestSessionId(req, res, next) {
  let id = (req.cookies && req.cookies[COOKIE_NAME]) || (req.headers['x-guest-session'] && req.headers['x-guest-session'].trim());
  if (id) {
    req.guestSessionId = id;
    return next();
  }
  id = randomUuid();
  req.guestSessionId = id;
  res.cookie(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
  next();
}
