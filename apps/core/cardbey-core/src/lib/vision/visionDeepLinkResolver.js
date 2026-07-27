/**
 * Resolve QR / barcode payloads into storefront or external URL actions.
 */

/**
 * @param {string} payload
 * @returns {{ action: 'open_store', slug?: string, storeId?: string } | { action: 'external_url', url: string } | { action: 'show_payload', payload: string }}
 */
export function resolveDeepLink(payload) {
  const raw = String(payload ?? '').trim();
  if (!raw) {
    return { action: 'show_payload', payload: raw };
  }

  const inlineSlug = raw.match(/(?:https?:\/\/[^/\s]+)?\/s\/([a-z0-9][a-z0-9-]*)/i);
  if (inlineSlug?.[1]) {
    return { action: 'open_store', slug: inlineSlug[1].toLowerCase() };
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const pathSlug = url.pathname.match(/\/s\/([a-z0-9][a-z0-9-]*)/i)?.[1];
      if (pathSlug) {
        return { action: 'open_store', slug: pathSlug.toLowerCase() };
      }
      const storeId = url.searchParams.get('storeId');
      if (storeId && /cardbey/i.test(url.hostname)) {
        return { action: 'open_store', storeId: storeId.trim() };
      }
      return { action: 'external_url', url: url.href };
    } catch {
      return { action: 'external_url', url: raw };
    }
  }

  if (/^[a-z0-9][a-z0-9-]{1,80}$/i.test(raw)) {
    return { action: 'open_store', slug: raw.toLowerCase() };
  }

  return { action: 'show_payload', payload: raw };
}
