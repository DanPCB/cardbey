/**
 * Service sub-page detection + bounded description fetch.
 * Used when homepage nav exposes real service links (not chrome).
 */

import { stripHtmlToText } from './htmlUtils.js';
import { isNavItem } from './navItemFilter.js';
import type { EnrichmentBudget } from './budget.js';
import { fetchHtml } from '../../social-import/scrapeUtils.js';

export type DetectedService = {
  name: string;
  url: string;
  description?: string;
};

function decodeEntities(text: string): string {
  return String(text ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}

function sameSite(baseUrl: string, candidateUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const cand = new URL(candidateUrl, baseUrl);
    return cand.hostname.replace(/^www\./i, '') === base.hostname.replace(/^www\./i, '');
  } catch {
    return false;
  }
}

/**
 * Detect service links from Services / What We Do nav sections and advisory path patterns.
 */
export function detectServiceLinks(html: string, baseUrl: string): DetectedService[] {
  const services: DetectedService[] = [];
  const seen = new Set<string>();

  const push = (nameRaw: string, href: string) => {
    const name = decodeEntities(stripHtmlToText(nameRaw, 80)).trim();
    if (!name || isNavItem(name)) return;
    if (name.length < 3 || name.length > 80) return;
    if (/^explore\b/i.test(name) || /\ball\s+advisory\s+services\b/i.test(name)) return;
    let url: string;
    try {
      url = new URL(href, baseUrl).href;
    } catch {
      return;
    }
    if (!sameSite(baseUrl, url)) return;
    try {
      const u = new URL(url);
      if (!u.pathname || u.pathname === '/') return;
      // Business-for-sale listings are not service pages
      if (/\/listing\//i.test(u.pathname)) return;
    } catch {
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    services.push({ name, url });
  };

  // 1) Sections under Services / What We Do / Our Services / Solutions
  const navSections = html.matchAll(
    /(?:services|what we do|our services|solutions)[^>]*>[\s\S]*?(?=<\/(?:ul|nav|div)>)/gi,
  );
  for (const section of navSections) {
    const links = [...section[0].matchAll(/href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const [, href, text] of links) {
      push(text ?? '', href ?? '');
      if (services.length >= 8) return services;
    }
  }

  // 2) Explicit advisory / service path links anywhere (Anison footer services list)
  const pathLinks = [
    ...html.matchAll(
      /href=["']([^"']*(?:advisory|service|services)[^"']*)["'][^>]*>[\s\S]*?(?:<span[^>]*>)?([\s\S]*?)(?:<\/span>)?<\/a>/gi,
    ),
  ];
  for (const [, href, text] of pathLinks) {
    push(text ?? '', href ?? '');
    if (services.length >= 8) break;
  }

  return services.slice(0, 8);
}

export async function fetchServiceDescriptions(
  services: DetectedService[],
  budget: EnrichmentBudget,
  maxFetches = 6,
): Promise<DetectedService[]> {
  const results: DetectedService[] = [];
  const toFetch = services.slice(0, maxFetches);

  for (const service of toFetch) {
    if (budget.websiteFetches >= budget.maxFetches) {
      results.push(service);
      continue;
    }
    try {
      budget.consumeFetch();
      const html = await fetchHtml(service.url, { timeoutMs: 5000 });
      if (!html) {
        results.push(service);
        continue;
      }

      const firstPara = html.match(/<p[^>]*>([\s\S]{40,400}?)<\/p>/i)?.[1];
      const paraText = firstPara
        ? decodeEntities(stripHtmlToText(firstPara, 400)).trim()
        : undefined;

      // Elementor text-editor fallback
      let description = paraText;
      if (!description || description.length < 40) {
        const editor = html.match(
          /elementor-widget-text-editor[^>]*>\s*([\s\S]{40,400}?)\s*<\/div>/i,
        )?.[1];
        if (editor) {
          const t = decodeEntities(stripHtmlToText(editor, 400)).trim();
          if (t.length >= 40) description = t;
        }
      }

      results.push({
        ...service,
        // Keep nav-detected service name — page H1 is often a shared brand/hero line.
        name: service.name,
        description,
      });
    } catch {
      results.push(service);
    }
  }

  // Append any not fetched due to cap
  for (const s of services.slice(toFetch.length)) {
    results.push(s);
  }

  return results;
}
