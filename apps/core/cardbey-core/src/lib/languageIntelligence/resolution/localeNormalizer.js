/**
 * Locale normalization for auto resolution.
 *
 * Match order: exact supported locale → base language → configured regional variant → null.
 * Never invents unsupported codes.
 */

import { LANGUAGE_CODES, FALLBACK_LANGUAGE, isLanguageCode } from '../contracts/languageCode.js';
import { getLanguage, getRegion, listLanguages, listRegions } from '../registries/index.js';

/** UI chrome languages currently available in dashboard i18next */
export const INTERFACE_LANGUAGE_CODES = Object.freeze(['en', 'vi']);

/**
 * Normalize raw tag: trim, lower, `_` → `-`, strip junk.
 * @param {unknown} raw
 * @returns {string}
 */
export function canonicalizeLocaleTag(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().toLowerCase().replace(/_/g, '-');
  // Take first from Accept-Language style "vi-au;q=0.9"
  s = s.split(',')[0].trim().split(';')[0].trim();
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(s) && !/^[a-z]{2,3}$/.test(s)) {
    // Allow simple tags; reject empty / garbage
    if (!/^[a-z]{2,3}(-[a-z]{2,8})?$/.test(s)) return '';
  }
  return s;
}

/**
 * Parse Accept-Language into ordered tags by q-weight (desc).
 * @param {unknown} header
 * @returns {string[]}
 */
export function parseAcceptLanguageHeader(header) {
  if (header == null || typeof header !== 'string' || !header.trim()) return [];
  const parts = header.split(',');
  /** @type {Array<{ tag: string, q: number }>} */
  const scored = [];
  for (const part of parts) {
    const seg = part.trim();
    if (!seg) continue;
    const [tagPart, ...params] = seg.split(';');
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q\s*=\s*([0-9.]+)$/i);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) q = n;
      }
    }
    const tag = canonicalizeLocaleTag(tagPart);
    if (tag) scored.push({ tag, q });
  }
  scored.sort((a, b) => b.q - a.q);
  return scored.map((s) => s.tag);
}

/**
 * @typedef {Object} LocaleMatch
 * @property {string|null} language          Supported primary language code
 * @property {string|null} matchedInput
 * @property {'exact'|'base'|'regional_variant'|null} matchKind
 * @property {string|null} regionalLocaleHint  BCP-47 for formatting when available
 */

/**
 * Match a single locale candidate against supported languages.
 * @param {unknown} raw
 * @param {{ supportedLanguages?: string[], regionId?: string|null }} [opts]
 * @returns {LocaleMatch}
 */
export function matchSupportedLocale(raw, opts = {}) {
  const supported = Array.isArray(opts.supportedLanguages) && opts.supportedLanguages.length
    ? opts.supportedLanguages.map((x) => String(x).toLowerCase())
    : [...LANGUAGE_CODES];
  const supportedSet = new Set(supported.filter((c) => isLanguageCode(c) || supported.includes(c)));

  const tag = canonicalizeLocaleTag(raw);
  if (!tag) {
    return { language: null, matchedInput: null, matchKind: null, regionalLocaleHint: null };
  }

  // Exact: full tag equals a supported code (rare for region tags) OR language registry bcp47
  for (const lang of listLanguages()) {
    if (!supportedSet.has(lang.id) && !supported.includes(lang.id)) continue;
    if (lang.bcp47 && lang.bcp47.toLowerCase() === tag) {
      return {
        language: lang.id,
        matchedInput: tag,
        matchKind: 'exact',
        regionalLocaleHint: lang.bcp47,
      };
    }
    if (lang.id === tag) {
      return {
        language: lang.id,
        matchedInput: tag,
        matchKind: 'exact',
        regionalLocaleHint: lang.bcp47 || lang.id,
      };
    }
  }

  // Also treat "en-au" as exact regional for en when en supported
  const base = tag.split('-')[0];
  if (supportedSet.has(tag) && isLanguageCode(tag)) {
    const def = getLanguage(tag);
    return {
      language: tag,
      matchedInput: tag,
      matchKind: 'exact',
      regionalLocaleHint: def?.bcp47 || tag,
    };
  }

  // Base language / configured regional variant (never invent unsupported codes)
  if (supportedSet.has(base) && isLanguageCode(base)) {
    const def = getLanguage(base);
    // e.g. en-GB + region AU → language en, formatting en-AU
    if (opts.regionId) {
      const region = getRegion(opts.regionId);
      if (
        region &&
        region.defaultLanguage === base &&
        region.intlLocale &&
        tag !== base
      ) {
        return {
          language: base,
          matchedInput: tag,
          matchKind: 'regional_variant',
          regionalLocaleHint: region.intlLocale,
        };
      }
    }
    const regionalLocaleHint = tag.includes('-') ? tag : def?.bcp47 || base;
    return {
      language: base,
      matchedInput: tag,
      matchKind: tag === base ? 'exact' : 'base',
      regionalLocaleHint,
    };
  }

  // Tag equals a registered region's intlLocale (e.g. en-AU → en)
  for (const region of listRegions()) {
    if (
      region.intlLocale &&
      String(region.intlLocale).toLowerCase() === tag &&
      supportedSet.has(region.defaultLanguage)
    ) {
      return {
        language: region.defaultLanguage,
        matchedInput: tag,
        matchKind: 'regional_variant',
        regionalLocaleHint: region.intlLocale,
      };
    }
  }

  return { language: null, matchedInput: tag, matchKind: null, regionalLocaleHint: null };
}

/**
 * Map display language → interface language (dashboard chrome en|vi).
 * @param {string} displayLanguage
 * @returns {string}
 */
export function resolveInterfaceLanguage(displayLanguage) {
  const code = String(displayLanguage || '').toLowerCase();
  if (INTERFACE_LANGUAGE_CODES.includes(code)) return code;
  return FALLBACK_LANGUAGE;
}

/**
 * Resolve regional formatting locale independently from display language.
 * @param {{ displayLanguage: string, regionId?: string|null, preferredRegionalLocale?: string|null, matchedRegionalHint?: string|null }} input
 */
export function resolveRegionalLocale(input) {
  if (input.preferredRegionalLocale) {
    const c = canonicalizeLocaleTag(input.preferredRegionalLocale);
    if (c) return c;
  }
  if (input.regionId) {
    const region = getRegion(input.regionId);
    if (region?.intlLocale) return region.intlLocale;
  }
  if (input.matchedRegionalHint) {
    const c = canonicalizeLocaleTag(input.matchedRegionalHint);
    if (c && c.includes('-')) return c;
  }
  const lang = getLanguage(input.displayLanguage);
  return lang?.bcp47 || input.displayLanguage || FALLBACK_LANGUAGE;
}
