/**
 * Shared LogoResult schema for multi-source logo search.
 *
 * Schema (all adapters return objects of this form):
 *   id, source, name, domain, logo_url, format, license, attribution_required
 */

export class LogoSourceNotConfiguredError extends Error {
  /** @param {string} source Provider key (e.g. "brandfetch") */
  constructor(source) {
    super(`Logo source not configured: ${source}`);
    this.name = 'LogoSourceNotConfiguredError';
    this.code = 'LOGO_SOURCE_NOT_CONFIGURED';
    this.source = source;
  }
}

export const LOGO_RESULT_FIELDS = Object.freeze([
  'id',
  'source',
  'name',
  'domain',
  'logo_url',
  'format',
  'license',
  'attribution_required',
]);

/**
 * @param {Partial<Record<string, unknown>>} raw
 */
export function normalizeLogoResult(raw = {}) {
  const fmt = String(raw.format || 'png').toLowerCase();
  return {
    id: raw.id != null ? String(raw.id) : '',
    source: raw.source != null ? String(raw.source) : '',
    name: raw.name != null ? String(raw.name) : '',
    domain: raw.domain != null ? String(raw.domain) : '',
    logo_url: raw.logo_url != null ? String(raw.logo_url) : '',
    format: fmt === 'svg' ? 'svg' : 'png',
    license: raw.license != null ? String(raw.license) : '',
    attribution_required: Boolean(raw.attribution_required),
  };
}

/** @param {{ logo_url?: string, id?: string }} result */
export function isValidLogoResult(result) {
  return Boolean(result && result.id && result.logo_url);
}

/**
 * Normalize user query to a bare hostname (no protocol/path).
 * @param {string} query
 */
export function resolveDomainFromQuery(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return '';
  if (q.includes('.')) {
    try {
      const withProto = q.startsWith('http') ? q : `https://${q}`;
      const host = new URL(withProto).hostname.replace(/^www\./, '');
      return host || q.split('/')[0].replace(/^www\./, '');
    } catch {
      return q.replace(/^www\./, '').split('/')[0].split('?')[0];
    }
  }
  const slug = q.replace(/[^a-z0-9-]/g, '');
  return slug ? `${slug}.com` : '';
}
