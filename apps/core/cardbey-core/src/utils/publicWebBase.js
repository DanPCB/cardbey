/**
 * Public marketing / dashboard SPA origin (absolute URL, no trailing slash).
 * Prefer PUBLIC_APP_URL, then DASHBOARD_URL, then FRONTEND_PUBLIC_URL.
 *
 * SEO / SKP canonical URLs use {@link publicCanonicalWebBase} instead, so
 * production can set PUBLIC_WEB_BASE_URL=https://cardbey.com without changing
 * SPA redirect origins on staging.
 *
 * @param {{ emptyInProductionIfUnset?: boolean }} [opts]
 *   When true and NODE_ENV is production with no env set, returns '' so callers avoid
 *   emitting a wrong Location header (post-verify redirect path in auth).
 */

const WEB_BASE_ENV_KEYS = ['PUBLIC_APP_URL', 'DASHBOARD_URL', 'FRONTEND_PUBLIC_URL'];
const CANONICAL_BASE_ENV_KEYS = [
  'PUBLIC_WEB_BASE_URL',
  'PUBLIC_CANONICAL_ORIGIN',
  ...WEB_BASE_ENV_KEYS,
];

function normalizePublicWebOrigin(raw) {
  return String(raw || '').trim().replace(/\/+$/, '');
}

/** Reject placeholder text and other non-absolute http(s) origins (e.g. "live dashboard URL"). */
export function isValidPublicWebOrigin(raw) {
  const trimmed = normalizePublicWebOrigin(raw);
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!u.hostname || /\s/.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function resolveOriginFromKeys(keys) {
  for (const key of keys) {
    const raw = process.env[key];
    const normalized = normalizePublicWebOrigin(raw);
    if (!normalized) continue;
    if (isValidPublicWebOrigin(normalized)) {
      return { origin: normalized, source: key };
    }
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[publicWebBase] Ignoring invalid env value', {
        env: key,
        valuePreview: normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized,
      });
    }
  }
  return { origin: null, source: null };
}

function resolvePublicWebOriginFromEnv() {
  return resolveOriginFromKeys(WEB_BASE_ENV_KEYS);
}

/**
 * Origin for SEO canonical URLs, sitemaps, and bot prerender HTML.
 * Prefer PUBLIC_WEB_BASE_URL (prod: https://cardbey.com), then SPA public envs,
 * then https://cardbey.com — never localhost for crawlable surfaces.
 */
export function publicCanonicalWebBase() {
  const { origin, source } = resolveOriginFromKeys(CANONICAL_BASE_ENV_KEYS);
  if (origin) {
    if (process.env.NODE_ENV !== 'test' && process.env.DEBUG_PUBLIC_WEB_BASE === '1') {
      console.log('[publicCanonicalWebBase]', { origin, source });
    }
    return origin;
  }
  return 'https://cardbey.com';
}

export function publicWebBase(opts = {}) {
  const { origin } = resolvePublicWebOriginFromEnv();
  if (origin) return origin;
  if (opts.emptyInProductionIfUnset && process.env.NODE_ENV === 'production') {
    return '';
  }
  return 'http://localhost:5174';
}

/** Canonical public store path (always safe for SPA navigation). */
export function buildPublicStorefrontPath(slug) {
  const s = String(slug ?? '').trim();
  if (!s) return null;
  return `/s/${encodeURIComponent(s)}`;
}

/**
 * Absolute storefront URL when a valid public web origin is configured;
 * otherwise a root-relative `/s/:slug` path (dashboard resolves with its own origin).
 * @param {string | null | undefined} slug
 * @param {{ storeId?: string | null }} [opts]
 */
export function buildPublicStorefrontUrl(slug, opts = {}) {
  const path = buildPublicStorefrontPath(slug);
  if (!path) {
    const storeId = String(opts.storeId ?? '').trim();
    return storeId ? `/preview/store/${encodeURIComponent(storeId)}?view=public` : null;
  }
  const { origin } = resolvePublicWebOriginFromEnv();
  if (origin) {
    return `${origin}${path}`;
  }
  return path;
}

/**
 * Prefer a validated publish URL from the API; rebuild from slug when the candidate
 * is missing, placeholder text, or uses an invalid origin.
 * @param {{ slug?: string | null; storeId?: string | null; candidate?: string | null }} params
 */
export function resolvePublicStorefrontUrl({ slug, storeId, candidate } = {}) {
  const raw = String(candidate ?? '').trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        if (isValidPublicWebOrigin(u.origin)) {
          return `${u.origin}${u.pathname}${u.search}${u.hash}`;
        }
      } catch {
        /* rebuild below */
      }
    } else if (raw.startsWith('/s/')) {
      return raw.split('?')[0];
    }
  }
  return buildPublicStorefrontUrl(slug, { storeId });
}

/** Log resolved SPA origin at startup; never throws. */
export function logPublicWebBaseOnStartup() {
  if (process.env.NODE_ENV === 'test') return;
  const { origin, source } = resolvePublicWebOriginFromEnv();
  console.log('[publicWebBase] Post-verify / SPA redirect origin', {
    origin: origin || '(unset)',
    source: source || '(none)',
  });
  if (process.env.NODE_ENV === 'production' && !origin) {
    console.error(
      '[publicWebBase] Production requires PUBLIC_APP_URL or DASHBOARD_URL (valid https:// origin) for email verification redirects.'
    );
  }
}
