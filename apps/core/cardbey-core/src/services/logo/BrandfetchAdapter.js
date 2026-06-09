/**
 * Brandfetch logo search adapter.
 *
 * Brand Search API (live shape): GET https://api.brandfetch.io/v2/search/{name}?c={clientId}
 * Returns an array of { brandId, name, domain, icon, claimed } — use `icon` as logo_url.
 *
 * Brand API (enrichment): GET https://api.brandfetch.io/v2/brands/{domain}
 * Authorization: Bearer — used when search hits lack a usable icon.
 *
 * Env: BRANDFETCH_API_KEY (client id for search ?c=, or Bearer for Brand API)
 */
import {
  LogoSourceNotConfiguredError,
  normalizeLogoResult,
  resolveDomainFromQuery,
  isValidLogoResult,
} from './LogoResult.js';

export const source = 'brandfetch';

const BRANDFETCH_SEARCH_BASE = 'https://api.brandfetch.io/v2/search';
const BRANDFETCH_BRAND_BASE = 'https://api.brandfetch.io/v2/brands';

export function isConfigured() {
  return Boolean(process.env.BRANDFETCH_API_KEY && process.env.BRANDFETCH_API_KEY.trim());
}

/** @param {string} url */
function formatFromUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('.svg')) return 'svg';
  return 'png';
}

/**
 * Pick logo URL from Brand API logos[] (formats with src).
 * @param {unknown} brandData
 */
function logoUrlFromBrandApi(brandData) {
  if (!brandData || typeof brandData !== 'object') return '';
  const b = /** @type {Record<string, unknown>} */ (brandData);
  const logos = Array.isArray(b.logos) ? b.logos : [];
  const priority = ['svg', 'png'];

  for (const logo of logos) {
    if (!logo || typeof logo !== 'object') continue;
    const lg = /** @type {Record<string, unknown>} */ (logo);
    const formats = Array.isArray(lg.formats) ? lg.formats : [];
    for (const fmtName of priority) {
      const f = formats.find(
        (x) =>
          x &&
          typeof x === 'object' &&
          String(/** @type {Record<string, unknown>} */ (x).format || '').toLowerCase() === fmtName &&
          typeof /** @type {Record<string, unknown>} */ (x).src === 'string'
      );
      if (f) return String(/** @type {Record<string, unknown>} */ (f).src);
    }
    const any = formats.find(
      (x) => x && typeof x === 'object' && typeof /** @type {Record<string, unknown>} */ (x).src === 'string'
    );
    if (any) return String(/** @type {Record<string, unknown>} */ (any).src);
  }

  if (Array.isArray(b.images)) {
    for (const img of b.images) {
      if (!img || typeof img !== 'object') continue;
      const im = /** @type {Record<string, unknown>} */ (img);
      const formats = Array.isArray(im.formats) ? im.formats : [];
      const f = formats.find(
        (x) => x && typeof x === 'object' && typeof /** @type {Record<string, unknown>} */ (x).src === 'string'
      );
      if (f) return String(/** @type {Record<string, unknown>} */ (f).src);
    }
  }

  return '';
}

/** @param {Record<string, unknown>} hit Search API hit */
function mapSearchHit(hit, query) {
  const domainRaw = typeof hit.domain === 'string' ? hit.domain : '';
  const domain = resolveDomainFromQuery(domainRaw) || domainRaw.replace(/^www\./, '');
  const icon = typeof hit.icon === 'string' ? hit.icon.trim() : '';
  const name = typeof hit.name === 'string' ? hit.name : query;
  const brandId = hit.brandId != null ? String(hit.brandId) : domain;

  if (!icon) return null;

  return normalizeLogoResult({
    id: `brandfetch-${brandId}`,
    source,
    name,
    domain,
    logo_url: icon,
    format: formatFromUrl(icon),
    license: 'Brandfetch',
    attribution_required: false,
  });
}

/**
 * @param {string} domain
 * @param {string} apiKey
 */
async function fetchBrandLogo(domain, apiKey) {
  if (!domain) return null;
  const res = await fetch(`${BRANDFETCH_BRAND_BASE}/${encodeURIComponent(domain)}`, {
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const logoUrl = logoUrlFromBrandApi(data);
  if (!logoUrl) return null;
  const name = typeof data?.name === 'string' ? data.name : domain;
  return normalizeLogoResult({
    id: `brandfetch-${data?.brandId ?? domain}`,
    source,
    name,
    domain,
    logo_url: logoUrl,
    format: formatFromUrl(logoUrl),
    license: 'Brandfetch',
    attribution_required: false,
  });
}

/**
 * @param {string} query
 * @returns {Promise<Array<ReturnType<typeof normalizeLogoResult>>>}
 */
export async function search(query) {
  const apiKey = process.env.BRANDFETCH_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new LogoSourceNotConfiguredError(source);
  }

  const q = String(query || '').trim();
  if (!q) return [];

  const searchName = q.includes('.') ? resolveDomainFromQuery(q).split('.')[0] || q : q;
  const url = new URL(`${BRANDFETCH_SEARCH_BASE}/${encodeURIComponent(searchName)}`);
  url.searchParams.set('c', apiKey.trim());

  let hits = [];
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      hits = Array.isArray(data) ? data : [];
    }
  } catch {
    hits = [];
  }

  const results = [];
  const seen = new Set();

  for (const hit of hits.slice(0, 12)) {
    if (!hit || typeof hit !== 'object') continue;
    const mapped = mapSearchHit(/** @type {Record<string, unknown>} */ (hit), q);
    if (mapped && isValidLogoResult(mapped) && !seen.has(mapped.id)) {
      seen.add(mapped.id);
      results.push(mapped);
      continue;
    }

    const domain =
      typeof /** @type {Record<string, unknown>} */ (hit).domain === 'string'
        ? resolveDomainFromQuery(String(/** @type {Record<string, unknown>} */ (hit).domain))
        : '';
    if (!domain || seen.has(`brandfetch-${domain}`)) continue;

    const enriched = await fetchBrandLogo(domain, apiKey);
    if (enriched && isValidLogoResult(enriched)) {
      seen.add(enriched.id);
      results.push(enriched);
    }
  }

  if (!results.length && q.includes('.')) {
    const domain = resolveDomainFromQuery(q);
    const single = await fetchBrandLogo(domain, apiKey);
    if (single && isValidLogoResult(single)) results.push(single);
  }

  return results;
}

export default { source, isConfigured, search };
