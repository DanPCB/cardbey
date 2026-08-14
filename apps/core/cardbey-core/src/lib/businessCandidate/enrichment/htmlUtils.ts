/**
 * Lightweight HTML helpers for multi-source enrichment (no Places photo cache).
 */

export function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  return m?.[1]?.trim() || null;
}

export function stripHtmlToText(html: string, maxLen = 8000): string {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function extractJsonLdLocalBusiness(html: string): Record<string, unknown> | null {
  const blocks = [...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1] ?? '');
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const typ = String((node as { '@type'?: string })['@type'] ?? '').toLowerCase();
        if (typ.includes('localbusiness') || typ.includes('restaurant') || typ.includes('store')) {
          return node as Record<string, unknown>;
        }
        if (Array.isArray((node as { '@graph'?: unknown })['@graph'])) {
          for (const g of (node as { '@graph': unknown[] })['@graph']) {
            if (!g || typeof g !== 'object') continue;
            const gt = String((g as { '@type'?: string })['@type'] ?? '').toLowerCase();
            if (gt.includes('localbusiness') || gt.includes('restaurant') || gt.includes('store')) {
              return g as Record<string, unknown>;
            }
          }
        }
      }
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return null;
}

export function firstHeading(html: string): string | null {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m?.[1]) return null;
  return stripHtmlToText(m[1], 200) || null;
}

export function navLabels(html: string): string[] {
  const nav = /<nav[\s\S]*?<\/nav>/i.exec(html)?.[0] ?? html.slice(0, 4000);
  const labels = [...nav.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => stripHtmlToText(m[1] ?? '', 40))
    .filter((t) => t.length >= 2 && t.length <= 40)
    .slice(0, 12);
  return [...new Set(labels)];
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function absoluteUrl(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = String(raw ?? '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function wordCount(text: string | null | undefined): number {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function isPlaceholderDescription(value: string | null | undefined): boolean {
  const t = String(value ?? '').trim().toLowerCase();
  if (!t) return true;
  if (['n/a', 'none', 'tbd', 'no description available'].includes(t)) return true;
  return wordCount(t) < 20;
}
