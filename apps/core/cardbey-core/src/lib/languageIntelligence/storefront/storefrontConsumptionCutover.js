/**
 * Stage 4 — public storefront consumption cutover facade.
 *
 * Uses consumeLocalizedContent (existing translations only).
 * Never mutates DB / canonical business rows.
 * generateMissingTranslations is always false.
 */

import { normalizeLanguageCode, FALLBACK_LANGUAGE } from '../contracts/languageCode.js';
import { consumeLocalizedContent } from '../consumption/consumeLocalizedContent.js';
import { INTERFACE_LANGUAGE_CODES } from '../resolution/localeNormalizer.js';
import {
  getStorefrontLanguagePolicyFromBusiness,
  isSupportedStorefrontDisplayLanguage,
} from './storefrontLanguagePolicy.js';
import {
  getStorefrontPilotStateFromBusiness,
  isPilotPublicLocalizationAllowed,
} from './storefrontPilotState.js';
import { readTranslationMetaMap } from './translationMetaStore.js';
import {
  fingerprintSourceText,
  translationMetaKey,
} from './translationMetaStore.js';
import { isPubliclyConsumableQualityStatus } from './translationQualityStatus.js';
import { isLanguageTranslationApprovalV1Enabled } from '../flags.js';
import { STOREFRONT_CUTOVER_REASON_CODES as RC } from './storefrontCutoverReasonCodes.js';
import {
  emitStorefrontCutoverTelemetry,
  hashStoreId,
} from './storefrontCutoverTelemetry.js';
import {
  isLanguageStorefrontConsumptionCutoverV1Enabled,
  isLanguageAutoResolutionV1Enabled,
  isLanguageIntelligenceV1Enabled,
} from '../flags.js';

export const STOREFRONT_CUTOVER_SURFACE = 'public_storefront_v1';
export const STOREFRONT_CUTOVER_POLICY_VERSION = 'storefront-cutover-policy-v1';

const STORE_FIELDS = ['name', 'description'];
const PRODUCT_FIELDS = ['name', 'description', 'category'];

/**
 * @param {unknown} mode
 * @returns {'original'|'translated'|'both'}
 */
function normalizeDisplayMode(mode) {
  if (mode === 'translated' || mode === 'both' || mode === 'original') return mode;
  return 'original';
}

/**
 * Build cache fingerprint for localized projections.
 */
export function buildStorefrontLocalizationCacheKey(parts = {}) {
  return [
    'sf-loc',
    parts.storeId || '',
    parts.contentRevision || '0',
    parts.requestedLanguage || '',
    parts.displayMode || 'original',
    parts.translationRevision || '0',
    STOREFRONT_CUTOVER_SURFACE,
    STOREFRONT_CUTOVER_POLICY_VERSION,
  ].join(':');
}

/**
 * @param {object} entity
 * @param {string} field
 * @param {string} targetLanguage
 * @param {string} canonicalLanguage
 * @param {'original'|'translated'|'both'} displayMode
 */
function consumeField(entity, field, targetLanguage, canonicalLanguage, displayMode) {
  return consumeLocalizedContent({
    contentOwnership: 'storefront_public',
    surface: STOREFRONT_CUTOVER_SURFACE,
    entity,
    field,
    originalLanguage: canonicalLanguage,
    targetLanguage,
    displayMode,
    explicitOptIn: true,
    allowGenerate: false,
    force: true, // cutover gate already enforced by caller
  });
}

/**
 * @param {ReturnType<typeof consumeField>} view
 */
function fieldStatusFromView(view) {
  if (!view || view.status === 'missing' || view.status === 'fallback_original' || !view.localizedText) {
    return 'fallback_original';
  }
  // Stage 4 cutover never calls TranslationEngine — existing JSON is not claimed as AI.
  // Cached AI attribution requires explicit provider metadata on the consumption view.
  if (view.providerId || view.translationSource === 'cached_ai' || view.translationSource === 'ai') {
    return 'cached_ai_translation';
  }
  return 'manual_translation';
}

/**
 * Stage 5A — whether a localized field may be rendered publicly.
 * @param {object} opts
 */
function mayConsumeLocalizedField(opts) {
  const {
    consumptionPolicy,
    metaMap,
    entityType,
    entityId,
    lang,
    field,
    sourceText,
    approvalEnforced,
  } = opts;

  if (consumptionPolicy === 'canonical_only') return { ok: false, reason: 'canonical_only' };
  if (!approvalEnforced || consumptionPolicy === 'existing_valid_translations') {
    return { ok: true, reason: 'existing_valid' };
  }
  // approved_translations_only
  const key = translationMetaKey({ entityType, entityId, lang, field });
  const meta = metaMap[key];
  if (!meta || !isPubliclyConsumableQualityStatus(meta.status)) {
    return { ok: false, reason: 'unapproved' };
  }
  const fp = fingerprintSourceText(sourceText);
  if (meta.sourceFingerprint && meta.sourceFingerprint !== fp) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, reason: 'approved' };
}

/**
 * Apply Stage 4 cutover to a public store DTO (in-memory copy).
 *
 * @param {object} input
 * @param {object} input.publicStore - Canonical public DTO
 * @param {object} input.business - Business row (translations + stylePreferences)
 * @param {object[]} [input.products] - Product rows with translations
 * @param {string} [input.requestedLanguage]
 * @param {string} [input.interfaceLanguage]
 * @param {string} [input.regionalLocale]
 * @param {'original'|'translated'|'both'} [input.displayMode]
 * @param {string} [input.resolutionSource]
 * @param {boolean} [input.shadowOnly] - Stage 4A: compute without mutating render fields
 * @param {boolean} [input.force] - bypass global flag (tests)
 */
export function applyStorefrontConsumptionCutover(input = {}) {
  const publicStore = input.publicStore && typeof input.publicStore === 'object'
    ? { ...input.publicStore }
    : {};
  const business = input.business || {};
  const products = Array.isArray(input.products) ? input.products : business.products || [];
  const policy = getStorefrontLanguagePolicyFromBusiness(business);
  const displayMode = normalizeDisplayMode(input.displayMode || policy.defaultDisplayMode);
  const fallbackReasons = [];
  /** @type {Record<string, object>} */
  const fieldMetadata = {};

  const globalOk =
    input.force ||
    (isLanguageIntelligenceV1Enabled() &&
      isLanguageAutoResolutionV1Enabled() &&
      isLanguageStorefrontConsumptionCutoverV1Enabled());

  if (!globalOk) {
    fallbackReasons.push(RC.STOREFRONT_LOCALIZATION_DISABLED_GLOBAL);
    return finalizeCanonical({
      publicStore,
      policy,
      displayMode,
      requestedLanguage: normalizeLanguageCode(input.requestedLanguage) || policy.canonicalLanguage,
      interfaceLanguage: resolveInterface(input.interfaceLanguage),
      regionalLocale: input.regionalLocale || null,
      resolutionSource: input.resolutionSource || 'none',
      fallbackReasons,
      reasonCode: RC.STOREFRONT_LOCALIZATION_DISABLED_GLOBAL,
      shadowOnly: true,
      applied: false,
    });
  }

  if (!policy.publicLocalizationEnabled || policy.translationPolicy === 'original_only') {
    fallbackReasons.push(RC.STOREFRONT_LOCALIZATION_DISABLED_STORE);
    return finalizeCanonical({
      publicStore,
      policy,
      displayMode: 'original',
      requestedLanguage: normalizeLanguageCode(input.requestedLanguage) || policy.canonicalLanguage,
      interfaceLanguage: resolveInterface(input.interfaceLanguage),
      regionalLocale: input.regionalLocale || null,
      resolutionSource: input.resolutionSource || 'none',
      fallbackReasons,
      reasonCode: RC.STOREFRONT_LOCALIZATION_DISABLED_STORE,
      shadowOnly: Boolean(input.shadowOnly),
      applied: false,
    });
  }

  const pilot = getStorefrontPilotStateFromBusiness(business);
  // Stage 5A: enrolled pilots must be active; non-enrolled keep Stage 4 behaviour (existing translations).
  if (pilot.enrolled && !isPilotPublicLocalizationAllowed(pilot) && !input.previewMode) {
    fallbackReasons.push(RC.STOREFRONT_LOCALIZATION_DISABLED_STORE);
    return finalizeCanonical({
      publicStore,
      policy,
      displayMode: 'original',
      requestedLanguage: normalizeLanguageCode(input.requestedLanguage) || policy.canonicalLanguage,
      interfaceLanguage: resolveInterface(input.interfaceLanguage),
      regionalLocale: input.regionalLocale || null,
      resolutionSource: input.resolutionSource || 'none',
      fallbackReasons,
      reasonCode: RC.STOREFRONT_LOCALIZATION_DISABLED_STORE,
      shadowOnly: Boolean(input.shadowOnly),
      applied: false,
    });
  }

  const consumptionPolicy = pilot.enrolled
    ? pilot.publicTranslationConsumptionPolicy || 'approved_translations_only'
    : 'existing_valid_translations';
  const approvalEnforced =
    Boolean(input.forceApproval) ||
    (isLanguageTranslationApprovalV1Enabled() &&
      consumptionPolicy === 'approved_translations_only');

  let liBlock = {};
  try {
    const prefs = business.stylePreferences;
    const parsed = typeof prefs === 'string' ? JSON.parse(prefs) : prefs;
    liBlock = parsed?.languageIntelligence || {};
  } catch {
    liBlock = {};
  }
  const metaMap = input.metaMap || readTranslationMetaMap(liBlock);

  let requestedLanguage =
    normalizeLanguageCode(input.requestedLanguage) || policy.canonicalLanguage;
  if (!isSupportedStorefrontDisplayLanguage(policy, requestedLanguage)) {
    fallbackReasons.push(RC.STOREFRONT_LANGUAGE_UNSUPPORTED);
    requestedLanguage = policy.canonicalLanguage;
  }

  const interfaceLanguage = resolveInterface(input.interfaceLanguage || requestedLanguage);
  const regionalLocale = input.regionalLocale || null;
  const shadowOnly = Boolean(input.shadowOnly);
  const contentRevision =
    String(business.updatedAt || publicStore.updatedAt || projectionFingerprint(publicStore) || '0');

  if (displayMode === 'original' || requestedLanguage === policy.canonicalLanguage) {
    fallbackReasons.push(RC.STOREFRONT_ORIGINAL_MODE);
    return finalizeCanonical({
      publicStore,
      policy,
      displayMode: 'original',
      requestedLanguage,
      interfaceLanguage,
      regionalLocale,
      resolutionSource: input.resolutionSource || 'none',
      fallbackReasons,
      reasonCode: RC.STOREFRONT_ORIGINAL_MODE,
      shadowOnly,
      applied: false,
      contentRevision,
    });
  }

  try {
    let fallbackFieldCount = 0;
    let translatedFieldCount = 0;
    let aiFieldCount = 0;

    // Store fields — use business row for translations JSON
    const storeEntity = {
      name: business.name ?? publicStore.name,
      description: business.description ?? publicStore.description,
      translations: business.translations,
    };
    const localizedStore = { ...publicStore };
    for (const field of STORE_FIELDS) {
      const view = consumeField(
        storeEntity,
        field,
        requestedLanguage,
        policy.canonicalLanguage,
        displayMode,
      );
      let status = fieldStatusFromView(view);
      const gate = mayConsumeLocalizedField({
        consumptionPolicy,
        metaMap,
        entityType: 'store',
        entityId: null,
        lang: requestedLanguage,
        field,
        sourceText: storeEntity[field],
        approvalEnforced,
      });
      if (status !== 'fallback_original' && !gate.ok) {
        status = 'fallback_original';
        fallbackReasons.push(
          gate.reason === 'stale' ? RC.STOREFRONT_TRANSLATION_STALE : RC.STOREFRONT_TRANSLATION_NOT_FOUND,
        );
      }
      fieldMetadata[`store.${field}`] = {
        sourceLanguage: policy.canonicalLanguage,
        renderedLanguage:
          status === 'fallback_original' ? policy.canonicalLanguage : requestedLanguage,
        status,
      };
      if (status === 'fallback_original') {
        fallbackFieldCount += 1;
        if (gate.ok) fallbackReasons.push(RC.STOREFRONT_TRANSLATION_NOT_FOUND);
      } else {
        translatedFieldCount += 1;
        if (status === 'cached_ai_translation') aiFieldCount += 1;
      }
      if (!shadowOnly) {
        localizedStore[field] =
          status === 'fallback_original'
            ? storeEntity[field]
            : view.localizedText ?? storeEntity[field];
      }
    }

    // Products — match by id
    const productById = new Map(
      products.filter((p) => p && p.id != null).map((p) => [String(p.id), p]),
    );
    const dtoProducts = Array.isArray(publicStore.products) ? publicStore.products : [];
    const localizedProducts = dtoProducts.map((dtoP) => {
      const raw = productById.get(String(dtoP.id)) || dtoP;
      const entity = {
        name: raw.name,
        description: raw.description,
        category: raw.category,
        translations: raw.translations,
      };
      const next = { ...dtoP };
      for (const field of PRODUCT_FIELDS) {
        if (entity[field] == null && dtoP[field] == null) continue;
        const view = consumeField(
          entity,
          field,
          requestedLanguage,
          policy.canonicalLanguage,
          displayMode,
        );
        let status = fieldStatusFromView(view);
        const gate = mayConsumeLocalizedField({
          consumptionPolicy,
          metaMap,
          entityType: 'product',
          entityId: dtoP.id,
          lang: requestedLanguage,
          field,
          sourceText: entity[field],
          approvalEnforced,
        });
        if (status !== 'fallback_original' && !gate.ok) {
          status = 'fallback_original';
        }
        fieldMetadata[`product.${dtoP.id}.${field}`] = {
          sourceLanguage: policy.canonicalLanguage,
          renderedLanguage:
            status === 'fallback_original' ? policy.canonicalLanguage : requestedLanguage,
          status,
        };
        if (status === 'fallback_original') {
          fallbackFieldCount += 1;
        } else {
          translatedFieldCount += 1;
          if (status === 'cached_ai_translation') aiFieldCount += 1;
        }
        if (!shadowOnly) {
          next[field] =
            status === 'fallback_original' ? entity[field] ?? dtoP[field] : view.localizedText ?? dtoP[field];
        }
      }
      return next;
    });

    if (!shadowOnly) {
      localizedStore.products = localizedProducts;
    }

    const dual =
      displayMode === 'both'
        ? Object.freeze({
            store: Object.freeze({
              name: Object.freeze({
                original: String(storeEntity.name ?? ''),
                translated: String(
                  fieldMetadata['store.name']?.status === 'fallback_original'
                    ? storeEntity.name ?? ''
                    : localizedStore.name ?? storeEntity.name ?? '',
                ),
                originalLang: policy.canonicalLanguage,
                translatedLang: requestedLanguage,
              }),
              description: Object.freeze({
                original: String(storeEntity.description ?? ''),
                translated: String(
                  fieldMetadata['store.description']?.status === 'fallback_original'
                    ? storeEntity.description ?? ''
                    : localizedStore.description ?? storeEntity.description ?? '',
                ),
                originalLang: policy.canonicalLanguage,
                translatedLang: requestedLanguage,
              }),
            }),
          })
        : null;

    const translationStatus =
      translatedFieldCount === 0
        ? 'fallback_original'
        : fallbackFieldCount > 0
          ? 'mixed'
          : aiFieldCount > 0
            ? 'cached_ai_translation'
            : 'manual_translation';

    const reasonCode =
      translationStatus === 'mixed'
        ? RC.STOREFRONT_MIXED_RENDER_SELECTED
        : translationStatus === 'fallback_original'
          ? RC.STOREFRONT_CANONICAL_FALLBACK
          : RC.STOREFRONT_LOCALIZED_RENDER_SELECTED;

    const result = Object.freeze({
      storeId: String(publicStore.id || business.id || ''),
      canonicalLanguage: policy.canonicalLanguage,
      requestedLanguage,
      renderedLanguage:
        translationStatus === 'fallback_original' ? policy.canonicalLanguage : requestedLanguage,
      displayMode,
      interfaceLanguage,
      regionalLocale,
      localizedStore: shadowOnly ? publicStore : localizedStore,
      localizedProducts: shadowOnly ? dtoProducts : localizedProducts,
      translationStatus,
      translatedByCardbeyAI: aiFieldCount > 0 && !shadowOnly,
      fallbackReasons: Object.freeze([...new Set(fallbackReasons)]),
      fieldMetadata: Object.freeze(fieldMetadata),
      policy,
      surface: STOREFRONT_CUTOVER_SURFACE,
      generateMissingTranslations: false,
      shadow: shadowOnly,
      applied: !shadowOnly,
      cacheKey: buildStorefrontLocalizationCacheKey({
        storeId: publicStore.id || business.id,
        contentRevision,
        requestedLanguage,
        displayMode,
        translationRevision: contentRevision,
      }),
      reasonCode,
      dual,
    });

    emitStorefrontCutoverTelemetry(
      shadowOnly ? 'language.storefront.cutover_selected' : 'language.storefront.translation_consumed',
      {
        storeId: result.storeId,
        storeIdHash: hashStoreId(result.storeId),
        requestedLanguage,
        renderedLanguage: result.renderedLanguage,
        displayMode,
        translationStatus,
        fallbackFieldCount,
        source: input.resolutionSource || 'resolve',
        featureEnabled: true,
        reasonCode,
        shadow: shadowOnly,
      },
    );

    if (fallbackFieldCount > 0) {
      emitStorefrontCutoverTelemetry('language.storefront.canonical_fallback', {
        storeId: result.storeId,
        requestedLanguage,
        renderedLanguage: result.renderedLanguage,
        displayMode,
        translationStatus,
        fallbackFieldCount,
        source: input.resolutionSource || 'resolve',
        featureEnabled: true,
        reasonCode: RC.STOREFRONT_CANONICAL_FALLBACK,
      });
    }

    return result;
  } catch (err) {
    fallbackReasons.push(RC.STOREFRONT_CONSUMPTION_FAILED);
    emitStorefrontCutoverTelemetry('language.storefront.canonical_fallback', {
      storeId: publicStore.id,
      requestedLanguage,
      displayMode,
      translationStatus: 'fallback_original',
      fallbackFieldCount: 0,
      source: input.resolutionSource || 'resolve',
      featureEnabled: true,
      reasonCode: RC.STOREFRONT_CONSUMPTION_FAILED,
    });
    return finalizeCanonical({
      publicStore,
      policy,
      displayMode: 'original',
      requestedLanguage,
      interfaceLanguage,
      regionalLocale,
      resolutionSource: input.resolutionSource || 'none',
      fallbackReasons,
      reasonCode: RC.STOREFRONT_CONSUMPTION_FAILED,
      shadowOnly: true,
      applied: false,
      contentRevision,
    });
  }
}

function resolveInterface(lang) {
  const n = normalizeLanguageCode(lang);
  if (n && INTERFACE_LANGUAGE_CODES.includes(n)) return n;
  return FALLBACK_LANGUAGE;
}

function projectionFingerprint(store) {
  try {
    return String(store?.website?.generatedAt || store?.products?.length || 0);
  } catch {
    return '0';
  }
}

function finalizeCanonical(args) {
  const {
    publicStore,
    policy,
    displayMode,
    requestedLanguage,
    interfaceLanguage,
    regionalLocale,
    resolutionSource,
    fallbackReasons,
    reasonCode,
    shadowOnly,
    applied,
    contentRevision = '0',
  } = args;

  const result = Object.freeze({
    storeId: String(publicStore.id || ''),
    canonicalLanguage: policy.canonicalLanguage,
    requestedLanguage,
    renderedLanguage: policy.canonicalLanguage,
    displayMode: 'original',
    interfaceLanguage,
    regionalLocale,
    localizedStore: publicStore,
    localizedProducts: Array.isArray(publicStore.products) ? publicStore.products : [],
    translationStatus: 'original',
    translatedByCardbeyAI: false,
    fallbackReasons: Object.freeze([...fallbackReasons]),
    fieldMetadata: Object.freeze({}),
    policy,
    surface: STOREFRONT_CUTOVER_SURFACE,
    generateMissingTranslations: false,
    shadow: Boolean(shadowOnly),
    applied: Boolean(applied),
    cacheKey: buildStorefrontLocalizationCacheKey({
      storeId: publicStore.id,
      contentRevision,
      requestedLanguage,
      displayMode: 'original',
      translationRevision: contentRevision,
    }),
    reasonCode,
    resolutionSource,
    dual: null,
  });

  emitStorefrontCutoverTelemetry('language.storefront.cutover_selected', {
    storeId: result.storeId,
    requestedLanguage,
    renderedLanguage: result.renderedLanguage,
    displayMode: result.displayMode,
    translationStatus: result.translationStatus,
    fallbackFieldCount: 0,
    source: resolutionSource,
    featureEnabled: isLanguageStorefrontConsumptionCutoverV1Enabled(),
    reasonCode,
    shadow: true,
  });

  return result;
}

/**
 * Attach safe public envelope onto store DTO (no private diagnostics dump).
 */
export function attachStorefrontLocalizationMeta(publicStore, cutoverResult) {
  if (!publicStore || !cutoverResult) return publicStore;
  const next = { ...publicStore };
  next.languageIntelligence = Object.freeze({
    ...(publicStore.languageIntelligence && typeof publicStore.languageIntelligence === 'object'
      ? publicStore.languageIntelligence
      : {}),
    storefrontLocalization: Object.freeze({
      surface: cutoverResult.surface,
      canonicalLanguage: cutoverResult.canonicalLanguage,
      requestedLanguage: cutoverResult.requestedLanguage,
      renderedLanguage: cutoverResult.renderedLanguage,
      displayMode: cutoverResult.displayMode,
      interfaceLanguage: cutoverResult.interfaceLanguage,
      regionalLocale: cutoverResult.regionalLocale,
      translationStatus: cutoverResult.translationStatus,
      translatedByCardbeyAI: cutoverResult.translatedByCardbeyAI,
      fallbackReasons: cutoverResult.fallbackReasons,
      applied: cutoverResult.applied,
      shadow: cutoverResult.shadow,
      reasonCode: cutoverResult.reasonCode,
      policy: Object.freeze({
        publicLocalizationEnabled: cutoverResult.policy.publicLocalizationEnabled,
        supportedDisplayLanguages: cutoverResult.policy.supportedDisplayLanguages,
        defaultDisplayMode: cutoverResult.policy.defaultDisplayMode,
        translationPolicy: cutoverResult.policy.translationPolicy,
        canonicalLanguage: cutoverResult.policy.canonicalLanguage,
      }),
      cacheKey: cutoverResult.cacheKey,
      dual: cutoverResult.dual || null,
    }),
  });
  return next;
}
