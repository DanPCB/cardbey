/**
 * GoogleBusinessAdapter
 *
 * Extracts public business data from a Google Business / Google Maps place URL.
 * Highest-value SME target: Google place pages expose structured data
 * (LocalBusiness JSON-LD + OpenGraph) with name, address, category, phone,
 * hours and photos.
 *
 * Resilient by design: every step is best-effort. If structured data is absent
 * (Google heavily client-renders Maps), we fall back to the place name encoded
 * in the Maps URL path so the import pipeline still produces a usable payload.
 */

import {
  fetchHtml,
  renderHtmlWithBrowser,
  extractMetaContent,
  extractTitle,
  extractJsonLd,
  jsonLdTypeIncludes,
  decodeHtmlEntities,
} from '../scrapeUtils.js';

export const platform = 'google_business';

const GOOGLE_BUSINESS_TYPES = [
  'LocalBusiness',
  'Restaurant',
  'Store',
  'CafeOrCoffeeShop',
  'FoodEstablishment',
  'Organization',
  'ProfessionalService',
  'HealthAndBeautyBusiness',
];

/**
 * @param {string} url
 * @returns {boolean}
 */
export function matches(url) {
  if (typeof url !== 'string') return false;
  const u = url.toLowerCase();
  return (
    u.includes('google.com/maps') ||
    u.includes('maps.google.') ||
    u.includes('goo.gl/maps') ||
    u.includes('maps.app.goo.gl') ||
    u.includes('business.google.com') ||
    u.includes('g.page')
  );
}

/**
 * @param {string} url
 * @returns {Promise<import('../normalizeToStorePayload.js').SocialImportRaw>}
 */
export async function extract(url) {
  const sourceUrl = String(url || '').trim();
  let html = await fetchHtml(sourceUrl);
  if (!html) {
    html = await renderHtmlWithBrowser(sourceUrl);
  }

  const jsonLd = extractJsonLd(html);
  const bizNode =
    jsonLd.find((n) => GOOGLE_BUSINESS_TYPES.some((t) => jsonLdTypeIncludes(n, t))) || null;

  const nameFromUrl = placeNameFromMapsUrl(sourceUrl);
  const businessName =
    pickString(bizNode?.name) ||
    extractMetaContent(html, 'og:title') ||
    stripGoogleSuffix(extractTitle(html)) ||
    nameFromUrl ||
    '';

  const description =
    pickString(bizNode?.description) || extractMetaContent(html, 'og:description') || '';

  const category = resolveCategory(bizNode);
  const location = resolveAddress(bizNode) || extractMetaContent(html, 'og:locality') || '';
  const hours = resolveHours(bizNode);

  const phone = pickString(bizNode?.telephone);
  const website = resolveWebsite(bizNode);
  const email = pickString(bizNode?.email);

  const images = resolveImages(bizNode, html);
  const profilePhoto = images[0] || '';
  const coverPhoto = images[0] || '';

  return {
    platform,
    sourceUrl,
    businessName,
    description,
    category,
    location,
    hours,
    contact: { phone, email, website },
    profilePhoto,
    coverPhoto,
    photos: images,
    posts: [],
    products: resolveProducts(bizNode),
    socialLinks: resolveSocialLinks(bizNode),
    priceRange: pickString(bizNode?.priceRange),
  };
}

function pickString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/** Google titles are often "<Name> - Google Maps". Strip the trailing app name. */
function stripGoogleSuffix(title) {
  if (!title) return '';
  return title
    .replace(/\s*[-–|]\s*Google\s*(Maps|Business|My Business)?\s*$/i, '')
    .trim();
}

/** Decode the place name from a /maps/place/<Name>/ path segment. */
function placeNameFromMapsUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/maps\/place\/([^/@]+)/i);
    if (m && m[1]) {
      return decodeHtmlEntities(decodeURIComponent(m[1].replace(/\+/g, ' '))).trim();
    }
  } catch {
    /* not a parseable URL */
  }
  return '';
}

function resolveCategory(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.servesCuisine === 'string' && node.servesCuisine.trim()) {
    return node.servesCuisine.trim();
  }
  if (Array.isArray(node.servesCuisine) && node.servesCuisine.length) {
    return String(node.servesCuisine[0]).trim();
  }
  const t = node['@type'];
  if (typeof t === 'string' && t.toLowerCase() !== 'organization') return t;
  if (Array.isArray(t)) {
    const specific = t.find((x) => String(x).toLowerCase() !== 'organization');
    if (specific) return String(specific);
  }
  return '';
}

function resolveAddress(node) {
  const addr = node?.address;
  if (!addr) return '';
  if (typeof addr === 'string') return addr.trim();
  if (typeof addr === 'object') {
    const parts = [
      addr.streetAddress,
      addr.addressLocality,
      addr.addressRegion,
      addr.postalCode,
      addr.addressCountry,
    ]
      .map((p) => (typeof p === 'string' ? p.trim() : typeof p === 'object' && p?.name ? String(p.name).trim() : ''))
      .filter(Boolean);
    return parts.join(', ');
  }
  return '';
}

function resolveHours(node) {
  const oh = node?.openingHours ?? node?.openingHoursSpecification;
  if (!oh) return '';
  if (typeof oh === 'string') return oh.trim();
  if (Array.isArray(oh)) {
    return oh
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const days = Array.isArray(entry.dayOfWeek) ? entry.dayOfWeek.join(', ') : entry.dayOfWeek || '';
          const open = entry.opens || '';
          const close = entry.closes || '';
          return [days, open && close ? `${open}-${close}` : ''].filter(Boolean).join(' ');
        }
        return '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function resolveWebsite(node) {
  const url = pickString(node?.url);
  if (url && !/google\.com|goo\.gl|g\.page/i.test(url)) return url;
  const same = node?.sameAs;
  if (Array.isArray(same)) {
    const site = same.find((s) => typeof s === 'string' && !/facebook|instagram|tiktok|twitter|x\.com/i.test(s));
    if (site) return site;
  }
  return '';
}

function resolveImages(node, html) {
  const out = [];
  const img = node?.image;
  if (typeof img === 'string') out.push(img);
  else if (Array.isArray(img)) {
    for (const i of img) {
      if (typeof i === 'string') out.push(i);
      else if (i && typeof i === 'object' && typeof i.url === 'string') out.push(i.url);
    }
  } else if (img && typeof img === 'object' && typeof img.url === 'string') {
    out.push(img.url);
  }
  const og = extractMetaContent(html, 'og:image');
  if (og) out.push(og);
  return [...new Set(out.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)))];
}

function resolveProducts(node) {
  const menu = node?.hasMenu ?? node?.menu;
  const products = [];
  const sections = menu?.hasMenuSection;
  if (Array.isArray(sections)) {
    for (const section of sections) {
      const items = section?.hasMenuItem;
      const categoryName = pickString(section?.name) || 'Menu';
      if (Array.isArray(items)) {
        for (const item of items) {
          const name = pickString(item?.name);
          if (!name) continue;
          const price = Number(item?.offers?.price ?? item?.offers?.[0]?.price ?? 0) || 0;
          products.push({ name, price, category: categoryName });
        }
      }
    }
  }
  return products.slice(0, 200);
}

function resolveSocialLinks(node) {
  const links = {};
  const same = node?.sameAs;
  if (Array.isArray(same)) {
    for (const s of same) {
      if (typeof s !== 'string') continue;
      if (/facebook\.com/i.test(s)) links.facebook = s;
      else if (/instagram\.com/i.test(s)) links.instagram = s;
      else if (/tiktok\.com/i.test(s)) links.tiktok = s;
      else if (/youtube\.com/i.test(s)) links.youtube = s;
    }
  }
  return links;
}

export default { platform, matches, extract };
