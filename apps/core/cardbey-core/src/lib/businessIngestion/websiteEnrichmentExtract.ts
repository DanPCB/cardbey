/**
 * Safe website factual extraction for Business Enrichment Agent V2.2.
 * Owner website only — no reviews, ratings, or competitor content.
 */

import { extractFromWebsite } from '../businessDiscovery/businessDiscoverySources.js';
import { normalizeWebsite } from '../businessDiscovery/businessDataNormalizer.js';
import { fetchHtml } from '../social-import/scrapeUtils.js';
import type { EnrichmentPermissionType } from './types.js';
import { sanitizeEnrichmentText } from './enrichmentSafety.js';

export type WebsiteEnrichmentFact = {
  field: 'description' | 'hero_image' | 'logo' | 'category' | 'opening_hours' | 'social_links' | 'services';
  value: string;
  sourceUrl: string;
  confidence: number;
  permissionType: EnrichmentPermissionType;
};

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  return m?.[1]?.trim() || null;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function mapCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[_/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || /organization|localbusiness/i.test(cleaned)) return null;
  return cleaned.length > 64 ? cleaned.slice(0, 64) : cleaned;
}

function openingHoursValue(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null && 'lines' in raw) {
    const lines = (raw as { lines: unknown }).lines;
    if (Array.isArray(lines) && lines.length) {
      return JSON.stringify({ lines: lines.map(String).slice(0, 14) });
    }
  }
  if (typeof raw === 'object' && raw !== null && 'weekday_text' in raw) {
    const wt = (raw as { weekday_text: unknown }).weekday_text;
    if (Array.isArray(wt) && wt.length) {
      return JSON.stringify({ weekday_text: wt.map(String).slice(0, 7) });
    }
  }
  return null;
}

/**
 * Extract safe factual enrichment from the seed's own website URL.
 */
export async function extractSafeWebsiteEnrichmentFacts(
  websiteUrl: string,
): Promise<WebsiteEnrichmentFact[]> {
  const normalized = normalizeWebsite(websiteUrl);
  if (!normalized) return [];

  const facts: WebsiteEnrichmentFact[] = [];
  const schemaResults = await extractFromWebsite(normalized);
  const schemaRaw = schemaResults[0]?.raw ?? {};
  const permissionType: EnrichmentPermissionType = schemaResults[0]?.source === 'schema_org'
    ? 'schema_org'
    : 'owner_website';

  const html = await fetchHtml(normalized, { timeoutMs: 8000 });
  const ogDescription = html ? metaContent(html, 'og:description') : null;
  const metaDescription = html ? metaContent(html, 'description') : null;
  const ogImage = html ? metaContent(html, 'og:image') : null;

  const description =
    sanitizeEnrichmentText(
      String((schemaRaw as { description?: string }).description ?? ogDescription ?? metaDescription ?? ''),
    ) ?? null;
  if (description) {
    facts.push({
      field: 'description',
      value: description,
      sourceUrl: normalized,
      confidence: (schemaRaw as { description?: string }).description ? 0.82 : 0.68,
      permissionType: ogDescription ? 'open_graph' : permissionType,
    });
  }

  const photos: string[] = Array.isArray((schemaRaw as { photos?: unknown }).photos)
    ? ((schemaRaw as { photos: unknown[] }).photos.map(String).filter(isHttpUrl))
    : [];
  const heroUrl = ogImage && isHttpUrl(ogImage) ? ogImage : photos[0] ?? null;
  if (heroUrl) {
    facts.push({
      field: 'hero_image',
      value: heroUrl,
      sourceUrl: normalized,
      confidence: ogImage ? 0.8 : 0.72,
      permissionType: ogImage ? 'open_graph' : permissionType,
    });
  }

  const logoUrl = photos.find((p) => /logo/i.test(p)) ?? photos[1] ?? null;
  if (logoUrl && logoUrl !== heroUrl) {
    facts.push({
      field: 'logo',
      value: logoUrl,
      sourceUrl: normalized,
      confidence: 0.7,
      permissionType,
    });
  }

  const category = mapCategory(
    typeof (schemaRaw as { category?: string }).category === 'string'
      ? (schemaRaw as { category: string }).category
      : null,
  );
  if (category) {
    facts.push({
      field: 'category',
      value: category,
      sourceUrl: normalized,
      confidence: 0.75,
      permissionType,
    });
  }

  const hours = openingHoursValue((schemaRaw as { openingHours?: unknown }).openingHours);
  if (hours) {
    facts.push({
      field: 'opening_hours',
      value: hours,
      sourceUrl: normalized,
      confidence: 0.78,
      permissionType,
    });
  }

  if ((schemaRaw as { socialLinks?: unknown }).socialLinks && typeof (schemaRaw as { socialLinks?: unknown }).socialLinks === 'object') {
    const links = Object.entries((schemaRaw as { socialLinks: Record<string, string> }).socialLinks).filter(
      ([, url]) => typeof url === 'string' && isHttpUrl(url),
    );
    if (links.length) {
      facts.push({
        field: 'social_links',
        value: JSON.stringify(Object.fromEntries(links.slice(0, 8))),
        sourceUrl: normalized,
        confidence: 0.85,
        permissionType: 'schema_org',
      });
    }
  }

  const keywords = Array.isArray((schemaRaw as { keywords?: unknown }).keywords)
    ? ((schemaRaw as { keywords: unknown[] }).keywords.map(String).filter(Boolean).slice(0, 8))
    : [];
  if (keywords.length) {
    const services = keywords.map((k) => sanitizeEnrichmentText(k, 80)).filter(Boolean) as string[];
    if (services.length) {
      facts.push({
        field: 'services',
        value: JSON.stringify(services),
        sourceUrl: normalized,
        confidence: 0.65,
        permissionType,
      });
    }
  }

  return facts;
}
