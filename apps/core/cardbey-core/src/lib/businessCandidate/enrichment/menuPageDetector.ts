/**
 * Detects menu pages from a business website.
 * Extends the service-link pattern from webExtractors with menu-specific signals.
 */

const MENU_URL_PATTERNS = [
  /\/menu\b/i,
  /\/our-menu/i,
  /\/food-menu/i,
  /\/drinks-menu/i,
  /\/full-menu/i,
  /\/dine-in/i,
  /\/order-online/i,
  /\/what-we-serve/i,
  /\/cuisine/i,
  /\/specials/i,
  /\/breakfast-menu/i,
  /\/lunch-menu/i,
  /\/dinner-menu/i,
  /\/takeaway/i,
  /\/thuc-don/i,
  /\/mon-an/i,
];

const MENU_LINK_TEXT_PATTERNS = [
  /\bmenu\b/i,
  /\bour food\b/i,
  /\bwhat we serve\b/i,
  /\bfood & drinks?\b/i,
  /\bdrinks?\b/i,
  /\bthực đơn\b/i,
  /\bмeню\b/i,
  /\bcarte\b/i,
  /\bmenú\b/i,
];

const THIRD_PARTY_MENU_DOMAINS = [
  'zomato.com',
  'opentable.com',
  'menulog.com.au',
  'ubereats.com',
  'doordash.com',
  'deliveroo.com.au',
  'dimmi.com.au',
];

export interface DetectedMenuSource {
  url: string;
  type: 'own_website' | 'third_party' | 'google_places';
  confidence: number;
  linkText: string | null;
}

function normalizeBaseUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return baseUrl.replace(/\/$/, '');
  }
}

function readGoogleMenuUrl(googlePlacesData: Record<string, unknown> | null): string | null {
  if (!googlePlacesData) return null;
  const candidates = [
    googlePlacesData.menu_url,
    googlePlacesData.menuUrl,
    googlePlacesData.menu_uri,
    googlePlacesData.menuUri,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

export function detectMenuSources(
  html: string,
  baseUrl: string,
  googlePlacesData: Record<string, unknown> | null,
): DetectedMenuSource[] {
  const sources: DetectedMenuSource[] = [];
  const baseOrigin = normalizeBaseUrl(baseUrl);

  const googleMenuUrl = readGoogleMenuUrl(googlePlacesData);
  if (googleMenuUrl && THIRD_PARTY_MENU_DOMAINS.some((d) => googleMenuUrl.includes(d))) {
    sources.push({
      url: googleMenuUrl,
      type: 'third_party',
      confidence: 0.9,
      linkText: 'Google Places menu link',
    });
  }

  const linkMatches = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  for (const [, href, rawText] of linkMatches) {
    const text = rawText.replace(/<[^>]+>/g, '').trim();

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(href, baseUrl).href;
    } catch {
      continue;
    }

    const isOwn = resolvedUrl.startsWith(baseOrigin);
    const isThirdParty = THIRD_PARTY_MENU_DOMAINS.some((d) => resolvedUrl.includes(d));
    const urlIsMenu = MENU_URL_PATTERNS.some((p) => p.test(href) || p.test(resolvedUrl));
    const textIsMenu = MENU_LINK_TEXT_PATTERNS.some((p) => p.test(text));

    if (!isOwn && !isThirdParty) continue;
    if (!isThirdParty && !urlIsMenu && !textIsMenu) continue;
    if (sources.some((s) => s.url === resolvedUrl)) continue;

    sources.push({
      url: resolvedUrl,
      type: isThirdParty ? 'third_party' : 'own_website',
      confidence: isThirdParty
        ? 0.75
        : urlIsMenu && textIsMenu
          ? 0.92
          : urlIsMenu
            ? 0.8
            : textIsMenu
              ? 0.65
              : 0.5,
      linkText: text || null,
    });
  }

  return sources.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

export function mapMenuSourceToExtractionSource(
  type: DetectedMenuSource['type'],
  url: string,
): import('./types/menuTypes.js').ExtractedMenuItem['extractionSource'] {
  if (type === 'google_places') return 'google_places_menu';
  if (url.includes('zomato.com')) return 'zomato';
  if (url.includes('opentable.com')) return 'opentable';
  if (url.includes('menulog.com.au')) return 'menulog';
  return 'website_menu_page';
}
