/**
 * Resolve a logo URL for a business candidate.
 * Priority: website icons → Logo.dev by domain → Logo.dev by name search.
 */

import { search as logoDevSearch } from '../../../services/logo/ClearbitAdapter.js';
import { absoluteUrl, isHttpUrl } from './htmlUtils.js';

export interface LogoFetchBudget {
  remaining: number;
}

function looksLikeLogoPath(url: string): boolean {
  return /logo|icon|brand|mark|favicon/i.test(url);
}

function resolveFromHtml(
  websiteHtml: string,
  website: string | null,
): string | null {
  const html = String(websiteHtml ?? '');

  const appleIcon =
    html.match(/rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i)?.[1];
  if (appleIcon) {
    try {
      const resolved = absoluteUrl(website ?? '', appleIcon);
      if (isHttpUrl(resolved)) return resolved;
    } catch {
      /* ignore */
    }
  }

  const ogImage =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
  if (ogImage && looksLikeLogoPath(ogImage)) {
    const resolved = isHttpUrl(ogImage) ? ogImage : absoluteUrl(website ?? '', ogImage);
    if (isHttpUrl(resolved)) return resolved;
  }

  return null;
}

async function logoDevByDomain(website: string): Promise<string | null> {
  try {
    const results = await logoDevSearch(website);
    return results[0]?.logo_url ?? null;
  } catch {
    return null;
  }
}

async function logoDevByName(businessName: string): Promise<string | null> {
  try {
    const results = await logoDevSearch(businessName);
    return results[0]?.logo_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve logo URL for pre-claim profile avatar.
 */
export async function resolveLogoUrl(
  businessName: string,
  website: string | null,
  websiteHtml: string | null,
  _fetchBudget: LogoFetchBudget,
): Promise<string | null> {
  if (websiteHtml) {
    const fromHtml = resolveFromHtml(websiteHtml, website);
    if (fromHtml) return fromHtml;
  }

  if (website) {
    const fromDomain = await logoDevByDomain(website);
    if (fromDomain) return fromDomain;
  }

  if (businessName?.trim() && process.env.LOGODEV_API_KEY?.trim()) {
    const fromName = await logoDevByName(businessName.trim());
    if (fromName) return fromName;
  }

  return null;
}
