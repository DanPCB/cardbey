/**
 * Supplement Bookwell venue discovery with Fresha service catalogs when bookable.
 */

const FRESHA_GRAPHQL = 'https://www.fresha.com/graphql';
const FETCH_TIMEOUT_MS = 8000;

const FRESHA_CATALOG_QUERY = `
  query FreshaServiceCatalog($slug: String!) {
    location(slug: $slug) {
      isBookable
      serviceCount
      serviceCatalog(context: BOOKING_FLOW) {
        ... on LocationServiceCatalogCategory {
          items {
            name
            caption
            retailPrice { formatted }
          }
        }
      }
    }
  }
`;

/**
 * @param {string} [freshaUrl]
 * @returns {Promise<string|null>}
 */
export async function resolveFreshaSlugFromUrl(freshaUrl) {
  const normalized = String(freshaUrl ?? '').trim();
  if (!normalized || !/fresha\.com/i.test(normalized)) return null;

  const direct = normalized.match(/fresha\.com\/a\/([^/?#]+)/i)?.[1];
  if (direct) return direct;

  const html = await fetchHtml(normalized);
  if (!html) return null;

  const slugFromNext = extractFreshaSlugFromHtml(html);
  if (slugFromNext) return slugFromNext;

  return html.match(/fresha\.com\/a\/([^"'/?#]+)/i)?.[1] ?? null;
}

/**
 * @param {string} html
 * @returns {string|null}
 */
export function extractFreshaSlugFromHtml(html) {
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextMatch) return null;
  try {
    const next = JSON.parse(nextMatch[1]);
    return next?.props?.pageProps?.data?.location?.slug ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} slug
 * @returns {Promise<Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>>}
 */
export async function fetchFreshaServiceCatalog(slug) {
  if (!slug) return [];

  const payload = await freshaGraphql(FRESHA_CATALOG_QUERY, { slug });
  const location = payload?.data?.location;
  if (!location?.isBookable) return [];

  const categories = location.serviceCatalog ?? [];
  const items = (Array.isArray(categories) ? categories : [categories]).flatMap((cat) => cat?.items ?? []);
  return mapFreshaItemsToOffers(items);
}

/**
 * @param {string} freshaUrl
 * @returns {Promise<Array<{ name: string; price: number|null; durationMinutes: number|null; description?: string }>>}
 */
export async function discoverFreshaVenueOffers(freshaUrl) {
  const slug = await resolveFreshaSlugFromUrl(freshaUrl);
  if (!slug) return [];
  return fetchFreshaServiceCatalog(slug);
}

/**
 * @param {unknown[]} items
 */
function mapFreshaItemsToOffers(items) {
  const offers = [];
  const seen = new Set();

  for (const item of items) {
    const name = cleanOfferName(item?.name);
    if (!name) continue;

    const priceText = item?.retailPrice?.formatted ?? '';
    const priceMatch = String(priceText).match(/\$?\s*(\d+(?:\.\d{2})?)/);
    const price = priceMatch ? Number(priceMatch[1]) : null;
    if (!Number.isFinite(price) || price <= 0) continue;

    const durationMinutes = parseDurationFromCaption(item?.caption);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    offers.push({
      name,
      price,
      durationMinutes,
      description: cleanOfferName(item?.caption) ?? '',
    });
    if (offers.length >= 120) break;
  }

  return offers;
}

/**
 * @param {unknown} caption
 */
function parseDurationFromCaption(caption) {
  const text = String(caption ?? '');
  const minMatch = text.match(/(\d+)\s*(?:min|mins|minutes)/i);
  if (minMatch) return Number(minMatch[1]);
  const hourMatch = text.match(/(\d+)\s*(?:hr|hour|hours)/i);
  if (hourMatch) return Number(hourMatch[1]) * 60;
  return null;
}

/**
 * @param {unknown} value
 */
function cleanOfferName(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

async function freshaGraphql(query, variables) {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FRESHA_GRAPHQL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.fresha.com',
        Referer: 'https://www.fresha.com/',
        'User-Agent': 'CardbeyDiscoveryBot/1.0 (+https://cardbey.com)',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url) {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CardbeyDiscoveryBot/1.0 (+https://cardbey.com)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
