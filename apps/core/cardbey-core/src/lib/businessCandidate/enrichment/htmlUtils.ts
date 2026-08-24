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

function decodeBasicHtmlEntities(text: string): string {
  return String(text ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * Canonical business description from site content (never invent).
 * Priority: JSON-LD Organization → og:description → meta description →
 * footer About block (incl. Elementor text-editor) → first paragraph after H1.
 */
export function extractDescription(html: string, _dom: unknown = null): string | null {
  const raw = String(html ?? '');

  const jsonLdBlocks = [
    ...raw.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1] ?? '');
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const typ = String((node as { '@type'?: string })['@type'] ?? '').toLowerCase();
        if (typ.includes('organization') || typ.includes('localbusiness')) {
          const desc = (node as { description?: unknown }).description;
          if (typeof desc === 'string' && desc.trim().length > 20) {
            return decodeBasicHtmlEntities(desc.trim());
          }
        }
        const graph = (node as { '@graph'?: unknown })['@graph'];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (!g || typeof g !== 'object') continue;
            const gt = String((g as { '@type'?: string })['@type'] ?? '').toLowerCase();
            if (gt.includes('organization') || gt.includes('localbusiness')) {
              const desc = (g as { description?: unknown }).description;
              if (typeof desc === 'string' && desc.trim().length > 20) {
                return decodeBasicHtmlEntities(desc.trim());
              }
            }
          }
        }
      }
    } catch {
      /* skip malformed JSON-LD */
    }
  }

  const ogDesc =
    raw.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']{20,})["']/i)?.[1] ??
    raw.match(/<meta[^>]*content=["']([^"']{20,})["'][^>]*property=["']og:description["']/i)?.[1];
  if (ogDesc) return decodeBasicHtmlEntities(ogDesc.trim());

  const metaDesc =
    raw.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{20,})["']/i)?.[1] ??
    raw.match(/<meta[^>]*content=["']([^"']{20,})["'][^>]*name=["']description["']/i)?.[1];
  if (metaDesc) return decodeBasicHtmlEntities(metaDesc.trim());

  const footer = /<footer[^>]*>[\s\S]*?<\/footer>/i.exec(raw)?.[0] ?? '';
  if (footer) {
    const aboutHeading = /(?:about\s*us|about|who\s+we\s+are)/i.exec(footer);
    if (aboutHeading && aboutHeading.index != null) {
      const after = footer.slice(aboutHeading.index, aboutHeading.index + 1200);
      const pMatch = after.match(/<p[^>]*>([\s\S]{40,500}?)<\/p>/i);
      if (pMatch?.[1]) {
        const text = stripHtmlToText(pMatch[1], 400);
        if (text.length >= 40) return decodeBasicHtmlEntities(text);
      }
      // Elementor / div text-editor: plain text between widgets after ABOUT US
      const editorMatch = after.match(
        /elementor-widget-text-editor[^>]*>\s*([\s\S]{40,500}?)\s*<\/div>/i,
      );
      if (editorMatch?.[1]) {
        const text = stripHtmlToText(editorMatch[1], 400);
        if (text.length >= 40) return decodeBasicHtmlEntities(text);
      }
      const loose = after
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      // Drop the heading label then take the first long sentence-ish chunk
      const withoutLabel = loose.replace(/^(about\s*us|about|who\s+we\s+are)\s*/i, '');
      if (withoutLabel.length >= 40 && withoutLabel.length <= 500) {
        return decodeBasicHtmlEntities(withoutLabel.slice(0, 480));
      }
      const sentence = withoutLabel.match(/[A-Z][\s\S]{39,400}?[.!?]/);
      if (sentence?.[0]) return decodeBasicHtmlEntities(sentence[0].trim());
    }
  }

  const afterH1 = raw.match(/<h1[^>]*>[\s\S]*?<\/h1>[\s\S]*?<p[^>]*>([\s\S]{40,300}?)<\/p>/i);
  if (afterH1?.[1]) {
    const text = stripHtmlToText(afterH1[1], 400);
    if (text.length >= 40) return decodeBasicHtmlEntities(text);
  }

  return null;
}

/** Concise H1 as tagline (not a full paragraph). */
export function extractTagline(html: string): string | null {
  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(String(html ?? ''));
  if (!h1Match?.[1]) return null;
  const text = decodeBasicHtmlEntities(stripHtmlToText(h1Match[1], 120)).trim();
  if (text.length > 0 && text.length < 80) return text;
  return null;
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
