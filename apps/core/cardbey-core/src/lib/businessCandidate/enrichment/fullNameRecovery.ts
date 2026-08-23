/**
 * Recover truncated Google Places business names via public page titles.
 * Uses at most one web fetch per call (budget-honest).
 */

import { fetchHtml } from '../../social-import/scrapeUtils.js';
import type { EnrichmentBudget } from './budget.js';
import { isNameTruncated } from './sourceSelector.js';

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function cleanYpTitle(title: string): string {
  return title.split('|')[0]?.split(' - ')[0]?.trim() ?? title.trim();
}

function cleanFbTitle(title: string): string {
  return title
    .replace(/\|\s*Facebook/i, '')
    .replace(/-\s*Facebook/i, '')
    .trim();
}

export async function recoverFullName(
  budget: EnrichmentBudget,
  truncatedName: string,
  suburb: string | null,
  opts?: {
    ypUrl?: string | null;
    fbUrl?: string | null;
    rawSourceJson?: Record<string, unknown> | null;
  },
): Promise<string | null> {
  const name = truncatedName.trim();
  if (!name) return null;
  if (!isNameTruncated(name, opts?.rawSourceJson ?? null) && !/[&,]\s*$/.test(name)) {
    return null;
  }

  // Prefer explicit YP listing URL, else one YP search (budget = 1 fetch).
  const target =
    opts?.ypUrl?.trim() ||
    `https://www.yellowpages.com.au/search/listings?clue=${encodeURIComponent(name)}&locationClue=${encodeURIComponent(suburb ?? 'Melbourne VIC')}`;

  budget.consumeFetch();
  const html = await fetchHtml(target, { timeoutMs: 5000 });
  if (!html) return null;

  const listing = html.match(/class="[^"]*listing-name[^"]*"[^>]*>([^<]+)</i);
  if (listing?.[1] && listing[1].trim().length > name.length) {
    return listing[1].trim();
  }

  const title = extractTitleFromHtml(html);
  if (title) {
    const cleaned = cleanYpTitle(title);
    if (cleaned.length > name.length + 2) return cleaned;
  }

  // Optional FB title only when YP path returned nothing and URL was not the search page.
  if (opts?.fbUrl?.trim() && budget.websiteFetches < budget.maxFetches) {
    budget.consumeFetch();
    const fbHtml = await fetchHtml(opts.fbUrl.trim(), { timeoutMs: 5000 });
    if (fbHtml) {
      const fbTitle = extractTitleFromHtml(fbHtml);
      if (fbTitle) {
        const cleaned = cleanFbTitle(fbTitle);
        if (cleaned.length > name.length + 2) return cleaned;
      }
    }
  }

  return null;
}

/** @internal */
export const __test = { cleanYpTitle, cleanFbTitle, extractTitleFromHtml };
