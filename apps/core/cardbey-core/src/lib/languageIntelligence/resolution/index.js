export { resolveLanguage } from './languageResolver.js';
export {
  LANGUAGE_REASON_CODES,
  confidenceForSource,
} from './languageResolutionReasonCodes.js';
export {
  INTERFACE_LANGUAGE_CODES,
  canonicalizeLocaleTag,
  parseAcceptLanguageHeader,
  matchSupportedLocale,
  resolveInterfaceLanguage,
  resolveRegionalLocale,
} from './localeNormalizer.js';
export {
  GUEST_LANGUAGE_COOKIE,
  readGuestLanguageCookie,
  setGuestLanguageCookie,
  clearGuestLanguageCookie,
  guestCookiePolicy,
} from './guestLanguagePreferenceCookie.js';
export {
  resolveAutoLanguage,
  toPublicLanguageResolutionEnvelope,
} from './autoLanguageResolver.js';
export {
  emitLanguageShadowTelemetry,
  listLanguageShadowTelemetry,
  __resetLanguageShadowTelemetryForTests,
} from './shadowLanguageTelemetry.js';
