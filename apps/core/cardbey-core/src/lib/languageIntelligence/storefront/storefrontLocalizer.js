/**
 * StorefrontLocalizer — localized views over canonical store/product data.
 *
 * Prefers translations JSON (view layer). Optionally generates via TranslationEngine.
 * NEVER mutates canonical fields. Default public mappers remain unchanged unless callers attach shadow.
 */

import { normalizeLanguageCode } from '../contracts/languageCode.js';
import { buildDualLanguageView } from '../contracts/dualLanguageView.js';
import { readLocalizedField, readCanonicalField } from '../adapters/translationUtilsAdapter.js';
import { detectLegacyMessageLocale } from '../adapters/localePromptAdapter.js';
import { resolveLanguage } from '../resolution/languageResolver.js';
import { translateEntityFields } from '../engine/translationEngine.js';
import { isLanguageIntelligenceStorefrontLocalizerV1Enabled } from '../flags.js';
import { renderDualLanguage, withViewMode } from '../dualLanguage/index.js';

export const STOREFRONT_LOCALIZER_VERSION = 'storefront-localizer-v1';

const PRODUCT_FIELDS = ['name', 'description', 'category'];
const STORE_FIELDS = ['name', 'description'];

/**
 * @param {object} entity
 * @param {string[]} fields
 * @param {string} targetLanguage
 * @param {string} sourceLanguage
 * @param {'original'|'translated'|'both'} mode
 */
function buildFieldViews(entity, fields, targetLanguage, sourceLanguage, mode) {
  /** @type {Record<string, ReturnType<typeof renderDualLanguage>>} */
  const fieldRenders = {};
  /** @type {Record<string, import('../contracts/dualLanguageView.js').DualLanguageView>} */
  const fieldViews = {};
  /** @type {Record<string, string|null>} */
  const localized = {};

  for (const field of fields) {
    const original = readCanonicalField(entity, field);
    const originalText = original == null ? '' : String(original);
    const fromLayer = readLocalizedField(entity, field, targetLanguage);
    const localizedText =
      fromLayer != null && String(fromLayer) !== originalText ? String(fromLayer) : null;

    const view = withViewMode(
      buildDualLanguageView({
        mode,
        originalLanguage: sourceLanguage,
        originalText,
        localizedLanguage: targetLanguage,
        localizedText,
        showTranslatedByAttribution: localizedText != null,
      }),
      mode,
    );
    fieldViews[field] = view;
    fieldRenders[field] = renderDualLanguage(view);
    localized[field] = localizedText ?? originalText;
  }

  return { fieldViews, fieldRenders, localized };
}

/**
 * Localize one product for a visitor language.
 * @param {object} input
 * @param {object} input.product
 * @param {string} [input.targetLanguage]
 * @param {'original'|'translated'|'both'} [input.mode]
 * @param {boolean} [input.generateIfMissing]  Call TranslationEngine when translations JSON missing
 * @param {boolean} [input.force]
 */
export async function localizeProductView(input) {
  if (!input.force && !isLanguageIntelligenceStorefrontLocalizerV1Enabled()) {
    return Object.freeze({ enabled: false, version: STOREFRONT_LOCALIZER_VERSION, product: null });
  }

  const product = input.product || {};
  const resolved = resolveLanguage({ explicitLanguage: input.targetLanguage });
  const targetLanguage = resolved.language;
  const mode = input.mode || 'translated';
  const sample = [product.name, product.description].filter(Boolean).join(' ');
  const sourceLanguage = detectLegacyMessageLocale(sample);

  let working = product;
  if (input.generateIfMissing && sourceLanguage !== targetLanguage) {
    const missing = PRODUCT_FIELDS.filter((f) => {
      const canon = readCanonicalField(product, f);
      if (canon == null || String(canon).trim() === '') return false;
      const loc = readLocalizedField(product, f, targetLanguage);
      return loc == null || String(loc) === String(canon);
    });
    if (missing.length > 0) {
      /** @type {Record<string, string>} */
      const fields = {};
      for (const f of missing) fields[f] = String(readCanonicalField(product, f));
      const generated = await translateEntityFields({
        model: product,
        entityType: 'product',
        entityId: String(product.id || 'unknown'),
        sourceLanguage,
        revision: product.updatedAt || 1,
        targetLanguage,
        fields,
        contentClass: 'product',
      });
      // In-memory merge for view only — caller may persist patch separately
      working = {
        ...product,
        translations: generated.patch.translations,
      };
    }
  }

  const built = buildFieldViews(working, PRODUCT_FIELDS, targetLanguage, sourceLanguage, mode);

  return Object.freeze({
    enabled: true,
    version: STOREFRONT_LOCALIZER_VERSION,
    productId: product.id ?? null,
    targetLanguage,
    sourceLanguage,
    mode,
    canonicalPreserved: true,
    localized: built.localized,
    fieldViews: built.fieldViews,
    fieldRenders: built.fieldRenders,
    // Patch only present when generateIfMissing produced engine output
    translationsPatch:
      working !== product && working.translations
        ? { translations: working.translations }
        : null,
  });
}

/**
 * Localize store + optional products.
 * @param {object} input
 * @param {object} input.store
 * @param {object[]} [input.products]
 * @param {string} [input.targetLanguage]
 * @param {'original'|'translated'|'both'} [input.mode]
 * @param {boolean} [input.generateIfMissing]
 * @param {boolean} [input.force]
 */
export async function localizeStorefrontView(input) {
  if (!input.force && !isLanguageIntelligenceStorefrontLocalizerV1Enabled()) {
    return Object.freeze({
      enabled: false,
      version: STOREFRONT_LOCALIZER_VERSION,
      store: null,
      products: [],
    });
  }

  const store = input.store || {};
  const resolved = resolveLanguage({ explicitLanguage: input.targetLanguage });
  const targetLanguage = resolved.language;
  const mode = input.mode || 'translated';
  const sample = [store.name, store.description].filter(Boolean).join(' ');
  const sourceLanguage = detectLegacyMessageLocale(sample);

  let workingStore = store;
  /** @type {{ translations: Record<string, Record<string, string>> }|null} */
  let storeTranslationsPatch = null;
  if (input.generateIfMissing && sourceLanguage !== targetLanguage) {
    /** @type {Record<string, string>} */
    const fields = {};
    for (const f of STORE_FIELDS) {
      const v = readCanonicalField(store, f);
      if (v != null && String(v).trim()) fields[f] = String(v);
    }
    if (Object.keys(fields).length > 0) {
      const generated = await translateEntityFields({
        model: store,
        entityType: 'store',
        entityId: String(store.id || 'unknown'),
        sourceLanguage,
        revision: store.updatedAt || 1,
        targetLanguage,
        fields,
        contentClass: 'product',
      });
      workingStore = { ...store, translations: generated.patch.translations };
      storeTranslationsPatch = generated.patch;
    }
  }

  const storeBuilt = buildFieldViews(
    workingStore,
    STORE_FIELDS,
    targetLanguage,
    sourceLanguage,
    mode,
  );

  const products = [];
  for (const product of input.products || []) {
    // eslint-disable-next-line no-await-in-loop
    const localized = await localizeProductView({
      product,
      targetLanguage,
      mode,
      generateIfMissing: input.generateIfMissing,
      force: true,
    });
    products.push(localized);
  }

  return Object.freeze({
    enabled: true,
    version: STOREFRONT_LOCALIZER_VERSION,
    storeId: store.id ?? null,
    targetLanguage,
    sourceLanguage,
    mode,
    canonicalPreserved: true,
    store: Object.freeze({
      localized: storeBuilt.localized,
      fieldViews: storeBuilt.fieldViews,
      fieldRenders: storeBuilt.fieldRenders,
      translationsPatch: storeTranslationsPatch,
    }),
    products: Object.freeze(products),
  });
}

/**
 * Advisory shadow attach — does not replace public DTO primary fields.
 * @param {object} publicDto  Existing toPublicStore / list DTO
 * @param {object} localized  Result of localizeStorefrontView
 */
export function applyStorefrontLocalizeShadow(publicDto, localized) {
  if (!publicDto || typeof publicDto !== 'object') {
    return { dto: publicDto, attached: false };
  }
  if (!localized?.enabled) {
    return { dto: publicDto, attached: false };
  }

  const meta = {
    ...(publicDto.meta && typeof publicDto.meta === 'object' ? publicDto.meta : {}),
    languageIntelligence: Object.freeze({
      version: STOREFRONT_LOCALIZER_VERSION,
      authoritative: false,
      targetLanguage: localized.targetLanguage,
      sourceLanguage: localized.sourceLanguage,
      mode: localized.mode,
      canonicalPreserved: true,
      store: localized.store,
      productCount: (localized.products || []).length,
    }),
  };

  return {
    dto: { ...publicDto, meta },
    attached: true,
  };
}
