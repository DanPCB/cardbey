/**
 * Canonical API origin for email verification links (GET /api/auth/verify/confirm).
 * Never log tokens; callers may log origin + path only.
 */

import os from 'os';

const INVALID_BASE_PATH_PATTERNS = ['/q/', '/go/'];
const DEV_LOCALHOST_FALLBACK = 'http://localhost:3001';

export const VERIFICATION_CONFIRM_PATH = '/api/auth/verify/confirm';
/** One-tap mobile-friendly verification (GET consumes token, redirects to SPA). */
export const VERIFICATION_EMAIL_PATH = '/api/auth/verify-email';

function normalizeOrigin(raw) {
  return String(raw || '').trim().replace(/\/+$/, '');
}

/** HTTP(S) origins without an explicit port default to :3001 (Core API), not :80. */
function ensureApiOriginHasPort(base) {
  try {
    const u = new URL(base);
    if (!u.port) {
      if (u.protocol === 'https:') {
        return u.origin;
      }
      const defaultPort = String(process.env.PORT || '3001').trim();
      u.port = defaultPort;
      const withPort = u.origin;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] Verification base URL missing port; using API port', {
          input: base,
          resolved: withPort,
        });
      }
      return withPort;
    }
    return u.origin;
  } catch {
    return base;
  }
}

function isInvalidBase(base) {
  return INVALID_BASE_PATH_PATTERNS.some((p) => base.includes(p));
}

function detectLanIPv4() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const nic of list || []) {
      if (nic && nic.family === 'IPv4' && !nic.internal) return nic.address;
    }
  }
  return null;
}

/**
 * @returns {string|null} Hostname only (no port), from LOCAL_NETWORK_HOST or auto-detect.
 */
function resolveLocalNetworkHost() {
  const raw = (process.env.LOCAL_NETWORK_HOST || '').trim();
  if (raw) {
    try {
      if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname;
    } catch {
      /* fall through */
    }
    return raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  }
  return detectLanIPv4();
}

function buildDevLanOrigin() {
  const host = resolveLocalNetworkHost();
  if (!host || host === '127.0.0.1') return null;
  const port = String(process.env.PORT || '3001').trim();
  return `http://${host}:${port}`;
}

function originUsesLocalhost(base) {
  try {
    const { hostname } = new URL(base);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(base);
  }
}

function isEmailVerificationActive() {
  const enabled =
    process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
  const hasMailHost = (process.env.MAIL_HOST || '').trim().length > 0;
  return enabled && hasMailHost;
}

/**
 * @returns {{ base: string, isFallback: boolean, source: string }}
 */
export function getVerificationLinkBaseUrl() {
  const renderExternal = normalizeOrigin(process.env.RENDER_EXTERNAL_URL);
  const envKeys = [
    ['EMAIL_VERIFICATION_BASE_URL', process.env.EMAIL_VERIFICATION_BASE_URL],
    ['EMAIL_VERIFICATION_API_ORIGIN', process.env.EMAIL_VERIFICATION_API_ORIGIN],
    ['CORE_PUBLIC_URL', process.env.CORE_PUBLIC_URL],
    ['PUBLIC_API_BASE_URL', process.env.PUBLIC_API_BASE_URL],
    ['PUBLIC_BASE_URL', process.env.PUBLIC_BASE_URL],
    ...(renderExternal ? [['RENDER_EXTERNAL_URL', renderExternal]] : []),
  ];

  for (const [key, value] of envKeys) {
    const base = normalizeOrigin(value);
    if (!base) continue;
    if (isInvalidBase(base)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] Verification link base rejected (invalid path segment)', { env: key, value: base });
      }
      continue;
    }
    return { base: ensureApiOriginHasPort(base), isFallback: false, source: key };
  }

  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const lan = buildDevLanOrigin();
    if (lan && !isInvalidBase(lan)) {
      return { base: ensureApiOriginHasPort(lan), isFallback: false, source: 'LOCAL_NETWORK_HOST|auto-lan' };
    }
  }

  return { base: DEV_LOCALHOST_FALLBACK, isFallback: true, source: 'localhost-fallback' };
}

/** Log origin + path at startup; never includes tokens. */
/** Safe token logging — prefix only, never full secret. */
export function verificationTokenLogFields(rawToken) {
  const t = String(rawToken ?? '');
  return {
    tokenLength: t.length,
    tokenPrefix: t.length >= 8 ? `${t.slice(0, 8)}…` : '(short)',
  };
}

export function logVerificationEmailDispatch(fields = {}) {
  if (process.env.NODE_ENV === 'test') return;
  console.log('[EMAIL_VERIFY_LINK_GENERATED]', fields);
  console.log('[Auth] verify/email dispatch', fields);
}

export function logVerificationEmailBaseOnStartup() {
  const { base, isFallback, source } = getVerificationLinkBaseUrl();
  let origin = base;
  try {
    origin = new URL(base).origin;
  } catch {
    /* keep base string */
  }

  console.log('[Auth] Email verification link base (origin only)', {
    origin,
    confirmPath: VERIFICATION_EMAIL_PATH,
    legacyConfirmPath: VERIFICATION_CONFIRM_PATH,
    source,
    isFallback,
  });

  if (process.env.NODE_ENV === 'production' && isFallback) {
    console.error(
      '[Auth] Production requires EMAIL_VERIFICATION_BASE_URL, CORE_PUBLIC_URL, or PUBLIC_API_BASE_URL for verification emails.'
    );
    return;
  }

  if (process.env.NODE_ENV !== 'production' && originUsesLocalhost(base) && isEmailVerificationActive()) {
    console.warn(
      '[Auth] WARNING: verification emails will use localhost. Links fail when opened from another device (e.g. Gmail on phone). Set EMAIL_VERIFICATION_BASE_URL or CORE_PUBLIC_URL to your LAN API URL (e.g. http://192.168.1.11:3001), or LOCAL_NETWORK_HOST=192.168.1.11 — or use ngrok.'
    );
  }
}
