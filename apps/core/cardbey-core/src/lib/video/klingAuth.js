// DANH: kling-video-wiring

import jwt from 'jsonwebtoken';

const TOKEN_EXPIRY_SECONDS = 1800; // 30 min
const TOKEN_BUFFER_SECONDS = 5; // clock skew

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Generates a JWT token from KLING_ACCESS_KEY +
 * KLING_SECRET_KEY. Caches for 25 minutes to
 * avoid regenerating on every request.
 */
export function getKlingToken() {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (5 min buffer)
  if (cachedToken && now < tokenExpiresAt - 300) {
    return cachedToken;
  }

  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;

  if (!ak || !sk) {
    throw new Error(
      'KLING_ACCESS_KEY and KLING_SECRET_KEY ' +
        'must be set in .env',
    );
  }

  const payload = {
    iss: ak,
    exp: now + TOKEN_EXPIRY_SECONDS,
    nbf: now - TOKEN_BUFFER_SECONDS,
  };

  cachedToken = jwt.sign(payload, sk, {
    algorithm: 'HS256',
    header: { typ: 'JWT' },
  });
  tokenExpiresAt = now + TOKEN_EXPIRY_SECONDS;

  return cachedToken;
}

/**
 * Returns Authorization header for Kling API
 */
export function getKlingHeaders() {
  return {
    Authorization: `Bearer ${getKlingToken()}`,
    'Content-Type': 'application/json',
  };
}

/** @internal test helper */
export function _resetKlingAuthCacheForTests() {
  cachedToken = null;
  tokenExpiresAt = 0;
}
