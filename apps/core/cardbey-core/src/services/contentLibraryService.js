/**
 * Content Library: SVGRepo + Brandfetch normalization and fetch helpers.
 */

import crypto from 'node:crypto';

const SVGREPO_SEARCH = 'https://www.svgrepo.com/api/search';

/** @param {string} s */
export function looksLikeDomain(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!t || t.length < 4) return false;
  // simple domain: has dot + TLD
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(t);
}

/** @param {string} s */
export function extractDomain(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split('?')[0]
    .toLowerCase();
}

/**
 * @param {unknown} raw
 * @param {'svgrepo' | 'brandfetch' | 'cardbey'} source
 * @param {object} [extra]
 */
export function normalizeToContentAsset(raw, source, extra = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);

  const id =
    (typeof o.id === 'string' && o.id) ||
    (typeof o.uid === 'string' && o.uid) ||
    (typeof o.slug === 'string' && o.slug) ||
    crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16);

  const name =
    (typeof o.name === 'string' && o.name) ||
    (typeof o.title === 'string' && o.title) ||
    (typeof o.label === 'string' && o.label) ||
    'Untitled';

  const url =
    (typeof o.url === 'string' && o.url) ||
    (typeof o.svg === 'string' && o.svg) ||
    (typeof o.download_url === 'string' && o.download_url) ||
    (typeof o.downloadUrl === 'string' && o.downloadUrl) ||
    (typeof o.href === 'string' && o.href) ||
    '';

  if (!url) return null;

  const thumb =
    (typeof o.thumbnail === 'string' && o.thumbnail) ||
    (typeof o.thumb === 'string' && o.thumb) ||
    (typeof o.preview === 'string' && o.preview) ||
    url;

  const type =
    extra.type ||
    (o.type === 'icon' || o.type === 'ICON' ? 'icon' : o.type === 'brand_kit' ? 'brand_kit' : 'logo');

  let format = 'svg';
  const u = url.toLowerCase();
  if (u.includes('.png') || u.endsWith('png')) format = 'png';
  else if (u.includes('.webp') || u.endsWith('webp')) format = 'webp';
  else if (u.includes('.svg') || u.endsWith('svg')) format = 'svg';

  const category = typeof extra.category === 'string' ? extra.category : typeof o.category === 'string' ? o.category : '';
  const tags = Array.isArray(extra.tags)
    ? extra.tags.map(String)
    : Array.isArray(o.tags)
      ? o.tags.map((t) => String(t))
      : [];

  const license =
    (typeof o.license === 'string' && o.license) ||
    (typeof o.licenseType === 'string' && o.licenseType) ||
    (source === 'svgrepo' ? 'SVGRepo terms' : source === 'brandfetch' ? 'Brandfetch display' : '');

  const metadata = typeof o === 'object' && o && !Array.isArray(o) ? { ...o } : {};
  if (extra.metadata && typeof extra.metadata === 'object') Object.assign(metadata, extra.metadata);

  return {
    id: `${source}:${id}`,
    name: String(name).slice(0, 256),
    url,
    thumbnail: thumb,
    type: /** @type {'logo' | 'icon' | 'brand_kit'} */ (type),
    format: /** @type {'svg' | 'png' | 'webp'} */ (format),
    source,
    category,
    tags,
    license,
    metadata,
  };
}

/**
 * Extract icon array from SVGRepo JSON (shape varies).
 * @param {unknown} json
 */
function svgRepoIconsFromJson(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const j = /** @type {Record<string, unknown>} */ (json);
    if (Array.isArray(j.icons)) return j.icons;
    if (Array.isArray(j.vectors)) return j.vectors;
    if (Array.isArray(j.data)) return j.data;
    if (Array.isArray(j.items)) return j.items;
    if (Array.isArray(j.results)) return j.results;
  }
  return [];
}

/**
 * @param {string} query
 * @param {string} [category]
 * @param {number} [limit]
 */
export async function searchSVGRepo(query, category, limit = 20) {
  const qParts = [query || 'logo', category].filter(Boolean);
  const q = qParts.join(' ').trim() || 'logo';
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);

  let icons = [];
  try {
    const url = `${SVGREPO_SEARCH}?${new URLSearchParams({ q, limit: String(lim) }).toString()}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CardbeyContentLibrary/1.0',
      },
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      console.warn('[contentLibrary] SVGRepo HTTP', res.status, url);
      return [];
    }
    const text = await res.text();
    if (!ct.includes('json') && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn('[contentLibrary] SVGRepo non-JSON response');
      return [];
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.warn('[contentLibrary] SVGRepo JSON parse failed');
      return [];
    }
    icons = svgRepoIconsFromJson(json);
  } catch (e) {
    console.warn('[contentLibrary] searchSVGRepo failed', e?.message || e);
    return [];
  }

  const out = [];
  for (const raw of icons) {
    const asset = normalizeToContentAsset(raw, 'svgrepo', { category: category || '' });
    if (asset) out.push(asset);
  }
  return out;
}

/**
 * @param {string} domain
 */
export async function lookupBrandfetch(domain) {
  const d = extractDomain(domain);
  if (!d) return null;
  const key = process.env.BRANDFETCH_API_KEY;
  if (!key) {
    console.warn('[contentLibrary] BRANDFETCH_API_KEY not set');
    return null;
  }
  const url = `https://api.brandfetch.io/v2/brands/${encodeURIComponent(d)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      console.warn('[contentLibrary] Brandfetch HTTP', res.status, d);
      return null;
    }
    const data = await res.json();
    return normalizeBrandKit(data, d);
  } catch (e) {
    console.warn('[contentLibrary] lookupBrandfetch failed', e?.message || e);
    return null;
  }
}

/**
 * @param {unknown} data
 * @param {string} domain
 */
export function normalizeBrandKit(data, domain) {
  if (!data || typeof data !== 'object') return null;
  const b = /** @type {Record<string, unknown>} */ (data);

  const name = typeof b.name === 'string' ? b.name : domain;
  const longDesc = typeof b.longDescription === 'string' ? b.longDescription : '';
  const desc = typeof b.description === 'string' ? b.description : longDesc;

  /** @type {{ hex: string, type: string }[]} */
  const colors = [];
  if (Array.isArray(b.colors)) {
    for (const c of b.colors) {
      if (c && typeof c === 'object') {
        const co = /** @type {Record<string, unknown>} */ (c);
        let hex = typeof co.hex === 'string' ? co.hex : typeof co.hexCode === 'string' ? co.hexCode : '';
        if (hex && !hex.startsWith('#')) hex = `#${hex}`;
        const type = typeof co.type === 'string' ? co.type : 'unknown';
        if (hex) colors.push({ hex, type });
      }
    }
  }

  /** @type {{ name: string, type: string }[]} */
  const fonts = [];
  if (Array.isArray(b.fonts)) {
    for (const f of b.fonts) {
      if (f && typeof f === 'object') {
        const fo = /** @type {Record<string, unknown>} */ (f);
        const fn = typeof fo.name === 'string' ? fo.name : '';
        const type = typeof fo.type === 'string' ? fo.type : 'unknown';
        if (fn) fonts.push({ name: fn, type });
      }
    }
  }

  let logoUrl = '';
  let iconUrl = '';
  let industry = '';
  if (Array.isArray(b.images)) {
    for (const img of b.images) {
      if (!img || typeof img !== 'object') continue;
      const im = /** @type {Record<string, unknown>} */ (img);
      const t = typeof im.type === 'string' ? im.type.toLowerCase() : '';
      const formats = Array.isArray(im.formats) ? im.formats : [];
      const first =
        formats.find((x) => x && typeof x === 'object' && /** @type {any} */ (x).src) || formats[0];
      const src =
        first && typeof first === 'object' && typeof /** @type {any} */ (first).src === 'string'
          ? /** @type {any} */ (first).src
          : typeof im.url === 'string'
            ? im.url
            : '';
      if (!src) continue;
      if (t === 'logo' && !logoUrl) logoUrl = src;
      if (t === 'icon' && !iconUrl) iconUrl = src;
    }
  }
  if (!logoUrl && Array.isArray(b.logos)) {
    for (const logo of b.logos) {
      if (!logo || typeof logo !== 'object') continue;
      const lg = /** @type {Record<string, unknown>} */ (logo);
      const fmts = Array.isArray(lg.formats) ? lg.formats : [];
      const f = fmts.find((x) => x && typeof x === 'object' && /** @type {any} */ (x).src);
      const src =
        f && typeof f === 'object' && typeof /** @type {any} */ (f).src === 'string'
          ? /** @type {any} */ (f).src
          : '';
      if (src) {
        logoUrl = src;
        break;
      }
    }
  }

  if (b._industry && typeof b._industry === 'object') {
    const ind = /** @type {Record<string, unknown>} */ (b._industry);
    industry = typeof ind.name === 'string' ? ind.name : '';
  }
  if (!industry && typeof b.industry === 'string') industry = b.industry;

  return {
    name,
    domain,
    logo_url: logoUrl,
    icon_url: iconUrl,
    colors,
    fonts,
    description: desc || null,
    industry: industry || null,
  };
}

/**
 * Brandfetch search assets (logos/icons) for merge into logo search.
 * @param {string} domain
 */
export async function brandfetchAssetsForDomain(domain) {
  const kit = await lookupBrandfetch(domain);
  if (!kit) return [];
  const assets = [];
  if (kit.logo_url) {
    const a = normalizeToContentAsset(
      {
        id: `${kit.domain}-logo`,
        name: `${kit.name} (logo)`,
        url: kit.logo_url,
        type: 'logo',
      },
      'brandfetch',
      { category: '', metadata: { domain: kit.domain, kit: true } },
    );
    if (a) assets.push(a);
  }
  if (kit.icon_url) {
    const a = normalizeToContentAsset(
      {
        id: `${kit.domain}-icon`,
        name: `${kit.name} (icon)`,
        url: kit.icon_url,
        type: 'icon',
      },
      'brandfetch',
      { category: '', metadata: { domain: kit.domain, kit: true } },
    );
    if (a) assets.push(a);
  }
  return assets;
}
