/**
 * autoLanguageResolver — Stage 0–2 wrapper around resolveLanguage.
 *
 * Separates displayLanguage / interfaceLanguage / regionalLocale.
 * Shadow-safe: does not mutate render paths or canonical content.
 *
 * Precedence:
 *   Signed-in + manual account: account > explicit session > (guest ignored) > auto
 *   Signed-in without manual:   explicit session > guest > auto
 *   Anonymous:                  explicit session > guest > auto
 */

import { resolveLanguage } from './languageResolver.js';
import { normalizeUserLocalePreference } from '../contracts/userLocalePreference.js';
import { FALLBACK_LANGUAGE } from '../contracts/languageCode.js';
import { getRegion } from '../registries/index.js';
import {
  parseAcceptLanguageHeader,
  matchSupportedLocale,
  resolveInterfaceLanguage,
  resolveRegionalLocale,
} from './localeNormalizer.js';
import {
  LANGUAGE_REASON_CODES,
  confidenceForSource,
} from './languageResolutionReasonCodes.js';
import { emitLanguageShadowTelemetry } from './shadowLanguageTelemetry.js';
import { isLanguageAutoResolutionV1Enabled } from '../flags.js';

/**
 * @typedef {Object} AutoLanguageResolveInput
 * @property {string|null|undefined} [explicitSessionLanguage]
 * @property {object|string|null|undefined} [accountPreference]
 * @property {string|null|undefined} [guestLanguage]
 * @property {string|null|undefined} [acceptLanguageHeader]
 * @property {string[]|null|undefined} [browserAcceptLanguages]
 * @property {string[]|null|undefined} [navigatorLanguages]
 * @property {string[]|null|undefined} [deviceLanguages]
 * @property {string|null|undefined} [region]
 * @property {string|null|undefined} [storeDefaultLanguage]
 * @property {string|null|undefined} [regionalDefaultLanguage]
 * @property {string|null|undefined} [preferredRegionalLocale]
 * @property {string[]} [supportedLanguages]
 * @property {string} [context]
 * @property {boolean} [authenticated]
 * @property {boolean} [emitTelemetry]
 * @property {boolean} [force]  bypass auto-resolution flag (tests / internal)
 */

/**
 * @param {AutoLanguageResolveInput} [input]
 */
export function resolveAutoLanguage(input = {}) {
  const accountPref = normalizeUserLocalePreference(
    typeof input.accountPreference === 'string'
      ? { preferredLanguage: input.accountPreference }
      : input.accountPreference,
  );
  const authenticated = Boolean(input.authenticated);
  const hasManualAccount = Boolean(
    accountPref.manualLanguageSelection && accountPref.preferredLanguage,
  );

  /** @type {Array<{ source: string, value?: string|null, accepted: boolean, reason: string }>} */
  const considered = [];
  const fallbackChain = [];

  /**
   * @param {string} source
   * @param {unknown} raw
   * @param {string} reasonCode
   */
  function tryCandidate(source, raw, reasonCode) {
    const match = matchSupportedLocale(raw, {
      supportedLanguages: input.supportedLanguages,
      regionId: input.region || accountPref.preferredRegion,
    });
    considered.push({
      source,
      value: raw == null ? null : String(raw),
      accepted: Boolean(match.language),
      reason: match.language
        ? `${reasonCode}:${match.matchKind}`
        : LANGUAGE_REASON_CODES.LANGUAGE_UNSUPPORTED_REJECTED,
    });
    if (!match.language) return null;
    fallbackChain.push(match.language);
    return { match, source, reasonCode };
  }

  /** @type {{ match: import('./localeNormalizer.js').LocaleMatch, source: string, reasonCode: string }|null} */
  let won = null;

  // --- Signed-in manual account first ---
  if (authenticated && hasManualAccount) {
    won = tryCandidate(
      'account_preference',
      accountPref.preferredLanguage,
      LANGUAGE_REASON_CODES.LANGUAGE_ACCOUNT_MANUAL,
    );
  }

  // --- Explicit session ---
  if (!won && input.explicitSessionLanguage) {
    won = tryCandidate(
      'explicit_session',
      input.explicitSessionLanguage,
      LANGUAGE_REASON_CODES.LANGUAGE_EXPLICIT_SESSION,
    );
  }

  // --- Guest cookie (skip when signed-in with manual account) ---
  if (!won && input.guestLanguage && !(authenticated && hasManualAccount)) {
    won = tryCandidate(
      'visitor_preference',
      input.guestLanguage,
      LANGUAGE_REASON_CODES.LANGUAGE_VISITOR_SAVED,
    );
  }

  // --- Account without manual (soft hint) already handled above for manual;
  //     if authenticated but not manual, allow account preferred as soft after guest? ---
  // Spec: guest before account when no manual. Soft account preferredLanguage after guest:
  if (!won && authenticated && accountPref.preferredLanguage && !hasManualAccount) {
    won = tryCandidate(
      'account_preference',
      accountPref.preferredLanguage,
      LANGUAGE_REASON_CODES.LANGUAGE_ACCOUNT_PREFERRED,
    );
  }

  // --- Accept-Language / browser lists ---
  if (!won) {
    const fromHeader = parseAcceptLanguageHeader(input.acceptLanguageHeader);
    const browserList = [
      ...(Array.isArray(input.browserAcceptLanguages) ? input.browserAcceptLanguages : []),
      ...fromHeader,
      ...(Array.isArray(input.navigatorLanguages) ? input.navigatorLanguages : []),
    ];
    for (const tag of browserList) {
      const match = matchSupportedLocale(tag, {
        supportedLanguages: input.supportedLanguages,
        regionId: input.region || accountPref.preferredRegion,
      });
      const browserReason = !match.language
        ? LANGUAGE_REASON_CODES.LANGUAGE_UNSUPPORTED_REJECTED
        : match.matchKind === 'exact'
          ? LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_EXACT_MATCH
          : match.matchKind === 'regional_variant'
            ? LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_REGIONAL_VARIANT
            : LANGUAGE_REASON_CODES.LANGUAGE_BROWSER_BASE_MATCH;
      considered.push({
        source: 'browser_accept_language',
        value: tag,
        accepted: Boolean(match.language),
        reason: browserReason,
      });
      if (match.language) {
        won = {
          match,
          source: 'browser_accept_language',
          reasonCode: browserReason,
        };
        fallbackChain.push(match.language);
        break;
      }
    }
  }

  // --- Device languages ---
  if (!won && Array.isArray(input.deviceLanguages)) {
    for (const tag of input.deviceLanguages) {
      const hit = tryCandidate('native_device', tag, LANGUAGE_REASON_CODES.LANGUAGE_DEVICE_MATCH);
      if (hit) {
        won = hit;
        break;
      }
    }
  }

  // --- Store / regional defaults ---
  if (!won && input.storeDefaultLanguage) {
    won = tryCandidate(
      'store_default',
      input.storeDefaultLanguage,
      LANGUAGE_REASON_CODES.LANGUAGE_STORE_FALLBACK,
    );
  }

  if (!won) {
    const regionId = input.region || accountPref.preferredRegion;
    const region = regionId ? getRegion(regionId) : null;
    const regionalLang =
      input.regionalDefaultLanguage || region?.defaultLanguage || null;
    if (regionalLang) {
      won = tryCandidate(
        'regional_default',
        regionalLang,
        LANGUAGE_REASON_CODES.LANGUAGE_REGION_FALLBACK,
      );
    }
  }

  // --- Global English ---
  if (!won) {
    won = {
      match: {
        language: FALLBACK_LANGUAGE,
        matchedInput: FALLBACK_LANGUAGE,
        matchKind: 'exact',
        regionalLocaleHint: 'en',
      },
      source: 'global_default',
      reasonCode: LANGUAGE_REASON_CODES.LANGUAGE_GLOBAL_FALLBACK,
    };
    fallbackChain.push(FALLBACK_LANGUAGE);
    considered.push({
      source: 'global_default',
      value: FALLBACK_LANGUAGE,
      accepted: true,
      reason: LANGUAGE_REASON_CODES.LANGUAGE_GLOBAL_FALLBACK,
    });
  }

  const displayLanguage = won.match.language || FALLBACK_LANGUAGE;
  const interfaceLanguage = resolveInterfaceLanguage(displayLanguage);
  const regionId = input.region || accountPref.preferredRegion || 'AU';
  const finalRegional = resolveRegionalLocale({
    displayLanguage,
    regionId,
    preferredRegionalLocale: input.preferredRegionalLocale || null,
    matchedRegionalHint: won.match.regionalLocaleHint,
  });

  const mode =
    won.source === 'explicit_session' ||
    won.source === 'visitor_preference' ||
    (won.source === 'account_preference' && hasManualAccount)
      ? 'manual'
      : 'automatic';

  const confidence = confidenceForSource(won.source, won.reasonCode);

  // Keep legacy resolveLanguage evidence aligned (shadow / compat)
  const legacy = resolveLanguage({
    explicitLanguage:
      won.source === 'explicit_session' ? displayLanguage : input.explicitSessionLanguage,
    accountPreference: accountPref,
    browserLanguage: input.acceptLanguageHeader || input.browserAcceptLanguages?.[0],
    deviceLanguage: input.deviceLanguages?.[0],
    region: regionId,
    manualSelection: hasManualAccount || mode === 'manual',
  });

  const result = Object.freeze({
    displayLanguage,
    interfaceLanguage,
    regionalLocale: finalRegional,
    source: won.source,
    confidence,
    matchedInput: won.match.matchedInput,
    fallbackChain: Object.freeze([...fallbackChain]),
    shouldPersist: mode === 'manual' && won.source === 'visitor_preference',
    persistenceScope:
      won.source === 'visitor_preference'
        ? 'visitor'
        : won.source === 'account_preference'
          ? 'account'
          : won.source === 'explicit_session'
            ? 'session'
            : 'none',
    reasonCode: won.reasonCode,
    mode,
    legacy,
    shadow: true,
    authoritative: false,
    diagnostics: Object.freeze({
      consideredSignals: Object.freeze(considered),
      context: input.context || 'public_storefront',
      authenticated,
      hasManualAccount,
    }),
  });

  if (
    input.emitTelemetry !== false &&
    (input.force || isLanguageAutoResolutionV1Enabled())
  ) {
    emitLanguageShadowTelemetry('language.resolution.completed', {
      context: input.context || 'public_storefront',
      selectedLanguage: displayLanguage,
      interfaceLanguage,
      regionalLocale: finalRegional,
      source: won.source,
      confidence,
      reasonCode: won.reasonCode,
      usedFallback: won.reasonCode === LANGUAGE_REASON_CODES.LANGUAGE_GLOBAL_FALLBACK,
      authenticated,
      mode,
      supportedExactMatch: won.match.matchKind === 'exact',
    });
  }

  return result;
}

/**
 * Safe public envelope (no private diagnostics).
 * @param {ReturnType<typeof resolveAutoLanguage>} resolution
 */
export function toPublicLanguageResolutionEnvelope(resolution) {
  return Object.freeze({
    displayLanguage: resolution.displayLanguage,
    interfaceLanguage: resolution.interfaceLanguage,
    regionalLocale: resolution.regionalLocale,
    source: resolution.source,
    confidence: resolution.confidence,
    reasonCode: resolution.reasonCode,
    mode: resolution.mode,
  });
}
