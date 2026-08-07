/**
 * First-party guest language cookie: cardbey_language
 *
 * Value = normalized supported language code only.
 * SameSite=Lax; Path=/; Secure in production; ~180 day expiry.
 */

import { matchSupportedLocale, canonicalizeLocaleTag } from './localeNormalizer.js';
import { isLanguageCode } from '../contracts/languageCode.js';

export const GUEST_LANGUAGE_COOKIE = 'cardbey_language';
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days

/**
 * @param {import('express').Request|object} req
 * @returns {string|null} Normalized language or null
 */
export function readGuestLanguageCookie(req) {
  const cookies = req?.cookies;
  let raw = null;
  if (cookies && typeof cookies === 'object' && cookies[GUEST_LANGUAGE_COOKIE] != null) {
    raw = cookies[GUEST_LANGUAGE_COOKIE];
  } else if (typeof req?.headers?.cookie === 'string') {
    const m = req.headers.cookie.match(/(?:^|;\s*)cardbey_language=([^;]+)/i);
    if (m) {
      try {
        raw = decodeURIComponent(m[1].trim());
      } catch {
        raw = m[1].trim();
      }
    }
  }
  if (raw == null) return null;
  const tag = canonicalizeLocaleTag(raw);
  if (!tag || tag.includes(';') || tag.length > 16) return null;
  // Cookie must be a primary supported language code (reject arbitrary payloads)
  if (!isLanguageCode(tag)) return null;
  const match = matchSupportedLocale(tag);
  return match.language && isLanguageCode(match.language) ? match.language : null;
}

/**
 * @param {import('express').Response} res
 * @param {string} language
 * @returns {{ ok: boolean, language?: string, error?: string }}
 */
export function setGuestLanguageCookie(res, language) {
  const match = matchSupportedLocale(language);
  if (!match.language) {
    return { ok: false, error: 'unsupported_locale' };
  }
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(GUEST_LANGUAGE_COOKIE, match.language, {
    maxAge: MAX_AGE_SECONDS * 1000,
    httpOnly: false, // readable by frontend for sync; still first-party only
    secure,
    sameSite: 'lax',
    path: '/',
  });
  return { ok: true, language: match.language };
}

/**
 * @param {import('express').Response} res
 */
export function clearGuestLanguageCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie(GUEST_LANGUAGE_COOKIE, {
    path: '/',
    sameSite: 'lax',
    secure,
  });
  // Also set expired cookie for clients that ignore clearCookie
  res.cookie(GUEST_LANGUAGE_COOKIE, '', {
    maxAge: 0,
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
  });
  return { ok: true };
}

/**
 * Cookie attribute snapshot for tests / diagnostics (no secrets).
 */
export function guestCookiePolicy() {
  return Object.freeze({
    name: GUEST_LANGUAGE_COOKIE,
    sameSite: 'Lax',
    path: '/',
    secureInProduction: true,
    maxAgeDays: 180,
    value: 'normalized_supported_language_code_only',
  });
}
