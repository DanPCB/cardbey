/**
 * Language Intelligence — Phases 1–5A + Auto Resolution Stage 0–2
 *
 * Stage 0–2: autoLanguageResolver (shadow), locale normalizer, guest cookie,
 * resolve API — no dashboard/storefront cutover; authoritative remains false.
 */

export * from './contracts/index.js';
export * from './registries/index.js';
export * from './resolution/index.js';
export * from './formatting/index.js';
export * from './adapters/index.js';
export * from './engine/index.js';
export * from './dualLanguage/index.js';
export * from './conversation/index.js';
export * from './storefront/index.js';
export * from './preferences/index.js';
export * from './cultural/index.js';
export * from './glossary/index.js';
export * from './consumption/index.js';
export {
  isLanguageIntelligenceV1Enabled,
  isLanguageIntelligenceEngineV1Enabled,
  isLanguageIntelligenceConversationV1Enabled,
  isLanguageIntelligenceStorefrontLocalizerV1Enabled,
  isLanguageIntelligencePreferencesV1Enabled,
  isLanguageIntelligenceConsumptionV1Enabled,
  isLanguageAutoResolutionV1Enabled,
  isLanguageResolveApiV1Enabled,
  isLanguageVisitorPreferenceV1Enabled,
  isLanguageDashboardPrefBridgeV1Enabled,
  isLanguageStorefrontConsumptionCutoverV1Enabled,
  isLanguageStorefrontSelectorV1Enabled,
  isLanguageStorefrontOwnerControlsV1Enabled,
  isLanguageTranslationApprovalV1Enabled,
  isLanguageTranslationReadinessV1Enabled,
  isLanguageStorefrontPilotEnrollmentV1Enabled,
  isLanguageStorefrontPilotDiagnosticsV1Enabled,
  isLanguageBlockEditArtifactTranslateEnabled,
  isLanguageIntelligenceAuthoritative,
} from './flags.js';

import {
  isLanguageIntelligenceV1Enabled,
  isLanguageIntelligenceEngineV1Enabled,
  isLanguageIntelligenceConversationV1Enabled,
  isLanguageIntelligenceStorefrontLocalizerV1Enabled,
  isLanguageIntelligencePreferencesV1Enabled,
  isLanguageIntelligenceConsumptionV1Enabled,
  isLanguageAutoResolutionV1Enabled,
  isLanguageResolveApiV1Enabled,
  isLanguageVisitorPreferenceV1Enabled,
  isLanguageDashboardPrefBridgeV1Enabled,
  isLanguageStorefrontConsumptionCutoverV1Enabled,
  isLanguageStorefrontSelectorV1Enabled,
  isLanguageStorefrontOwnerControlsV1Enabled,
  isLanguageTranslationApprovalV1Enabled,
  isLanguageStorefrontPilotEnrollmentV1Enabled,
  isLanguageIntelligenceAuthoritative,
} from './flags.js';
import { listLanguages, listRegions, listGlossaryEntries } from './registries/index.js';
import {
  ENGINE_VERSION,
  translationCacheSize,
  translationMemoryKeyCount,
  getTranslationAuditStats,
  getTranslationProvider,
} from './engine/index.js';
import { CONVERSATION_TRANSLATOR_VERSION } from './conversation/index.js';
import { STOREFRONT_LOCALIZER_VERSION } from './storefront/index.js';
import { CONSUMPTION_BOUNDARY_VERSION, getConsumptionFrameworkInfo } from './consumption/index.js';

/**
 * Safe diagnostic snapshot. Empty when flag off.
 */
export function getLanguageIntelligenceDiagnostics() {
  if (!isLanguageIntelligenceV1Enabled()) {
    return Object.freeze({
      enabled: false,
      authoritative: false,
      languageCount: 0,
      regionCount: 0,
      glossaryCount: 0,
      phase: 1,
      extensions: Object.freeze([]),
      engine: null,
      conversation: null,
      storefrontLocalizer: null,
      preferences: null,
      consumption: null,
      autoResolution: null,
      dashboardPrefBridge: null,
      storefrontCutover: null,
    });
  }
  const engineEnabled = isLanguageIntelligenceEngineV1Enabled();
  const conversationEnabled = isLanguageIntelligenceConversationV1Enabled();
  const storefrontEnabled = isLanguageIntelligenceStorefrontLocalizerV1Enabled();
  const preferencesEnabled = isLanguageIntelligencePreferencesV1Enabled();
  const consumptionEnabled = isLanguageIntelligenceConsumptionV1Enabled();
  const autoResolutionEnabled = isLanguageAutoResolutionV1Enabled();
  const dashboardPrefBridgeEnabled = isLanguageDashboardPrefBridgeV1Enabled();
  const storefrontCutoverEnabled = isLanguageStorefrontConsumptionCutoverV1Enabled();

  let phase = 1;
  if (engineEnabled) phase = 2;
  if (conversationEnabled || storefrontEnabled) phase = 3;
  if (preferencesEnabled) phase = 4;
  if (consumptionEnabled) phase = 5;

  /** Additive milestones (do not clobber numeric phase — avoids parallel-test env races). */
  const extensions = [];
  if (autoResolutionEnabled) extensions.push('auto-0-2');
  if (dashboardPrefBridgeEnabled) extensions.push('dash-bridge');
  if (storefrontCutoverEnabled) extensions.push('storefront-cutover-v1');

  return Object.freeze({
    enabled: true,
    authoritative: isLanguageIntelligenceAuthoritative(),
    languageCount: listLanguages().length,
    regionCount: listRegions().length,
    glossaryCount: listGlossaryEntries().length,
    languageIds: listLanguages().map((l) => l.id),
    regionIds: listRegions().map((r) => r.id),
    glossaryIds: listGlossaryEntries().map((g) => g.id),
    phase,
    extensions: Object.freeze(extensions),
    engine: engineEnabled
      ? Object.freeze({
          version: ENGINE_VERSION,
          enabled: true,
          providerId: getTranslationProvider()?.id ?? null,
          cacheSize: translationCacheSize(),
          memoryKeyCount: translationMemoryKeyCount(),
          audit: getTranslationAuditStats(),
        })
      : Object.freeze({ enabled: false, version: ENGINE_VERSION }),
    conversation: Object.freeze({
      enabled: conversationEnabled,
      version: CONVERSATION_TRANSLATOR_VERSION,
    }),
    storefrontLocalizer: Object.freeze({
      enabled: storefrontEnabled,
      version: STOREFRONT_LOCALIZER_VERSION,
    }),
    preferences: Object.freeze({
      enabled: preferencesEnabled,
      version: 'preferences-v1',
      storage: 'AccountProfile.languages + Business.stylePreferences.languageIntelligence',
    }),
    consumption: Object.freeze({
      enabled: consumptionEnabled,
      version: CONSUMPTION_BOUNDARY_VERSION,
      ...getConsumptionFrameworkInfo(),
      // Content surfaces — only exact pilot when cutover flag on (store opt-in still required at request time)
      surfacesWired: storefrontCutoverEnabled
        ? Object.freeze(['public_storefront_v1'])
        : Object.freeze([]),
    }),
    autoResolution: Object.freeze({
      enabled: autoResolutionEnabled,
      resolveApi: isLanguageResolveApiV1Enabled(),
      visitorPreference: isLanguageVisitorPreferenceV1Enabled(),
      shadowOnly: !storefrontCutoverEnabled,
      surfacesWired: [],
    }),
    dashboardPrefBridge: Object.freeze({
      enabled: dashboardPrefBridgeEnabled,
      /** Chrome i18next sync only — not content/storefront cutover */
      surfacesWired: dashboardPrefBridgeEnabled ? Object.freeze(['dashboard_chrome']) : Object.freeze([]),
      authoritative: false,
      silentLocalStorageMigration: false,
    }),
    storefrontCutover: Object.freeze({
      enabled: storefrontCutoverEnabled,
      selector: isLanguageStorefrontSelectorV1Enabled(),
      surface: 'public_storefront_v1',
      generateMissingTranslations: false,
      authoritative: false,
      requiresStoreOptIn: true,
      ownerControls: isLanguageStorefrontOwnerControlsV1Enabled(),
      approvalEnforcement: isLanguageTranslationApprovalV1Enabled(),
      pilotEnrollment: isLanguageStorefrontPilotEnrollmentV1Enabled(),
    }),
  });
}
