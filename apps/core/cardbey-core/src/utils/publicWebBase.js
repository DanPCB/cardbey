/**
 * Public marketing / dashboard SPA origin (absolute URL, no trailing slash).
 * Prefer PUBLIC_APP_URL, then DASHBOARD_URL (e.g. https://www.cardbey.com in staging/prod).
 *
 * @param {{ emptyInProductionIfUnset?: boolean }} [opts]
 *   When true and NODE_ENV is production with no env set, returns '' so callers avoid
 *   emitting a wrong Location header (post-verify redirect path in auth).
 */
export function publicWebBase(opts = {}) {
  const raw = (process.env.PUBLIC_APP_URL || process.env.DASHBOARD_URL || '').trim().replace(/\/+$/, '');
  if (raw) return raw;
  if (opts.emptyInProductionIfUnset && process.env.NODE_ENV === 'production') {
    return '';
  }
  return 'http://localhost:5174';
}
