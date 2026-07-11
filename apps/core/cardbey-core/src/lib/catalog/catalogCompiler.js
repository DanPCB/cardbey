/**
 * Typed catalog compiler — selects generator by BusinessCommerceProfile.catalogKind.
 */

import { resolveCommerceProfile } from '../commerce/resolveCommerceProfile.js';
import { assertCatalogKindConsistency, countCatalogItemsByKind } from '../commerce/assertCatalogKindConsistency.js';
import {
  generateMenuCatalog,
  generateProductCatalog,
  generateServiceCatalogFromBlueprint,
  stampServiceCatalogItems,
} from './generators/index.js';

/**
 * @returns {boolean}
 */
export function isTypedCatalogCompilerEnabled() {
  const raw = String(process.env.ENABLE_TYPED_CATALOG_COMPILER ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  if (raw === 'true' || raw === '1' || raw === 'on') return true;
  return process.env.NODE_ENV !== 'production';
}

/**
 * @param {import('../commerce/commerceProfileTypes.js').BusinessCommerceProfile} profile
 * @param {string} generatorName
 */
function logCompilerSelection(profile, generatorName) {
  console.log('[CatalogCompiler] selected generator', {
    catalogKind: profile.catalogKind,
    businessKind: profile.businessKind,
    generator: generatorName,
  });
}

/**
 * Compile legacy catalog build result into typed catalog contract.
 * @param {object} legacyResult - { categories, products, meta }
 * @param {object} ctx - build context (businessName, location, etc.)
 * @param {{ businessCommerceProfile?: import('../commerce/commerceProfileTypes.js').BusinessCommerceProfile, strict?: boolean }} [opts]
 */
export function compileCatalogForStore(legacyResult, ctx = {}, opts = {}) {
  const profile = opts.businessCommerceProfile ?? resolveCommerceProfile(ctx);
  let compiled;

  if (profile.catalogKind === 'service') {
    logCompilerSelection(profile, 'ServiceCatalogGenerator');
    compiled = generateServiceCatalogFromBlueprint(
      { categories: legacyResult?.categories, items: legacyResult?.products ?? legacyResult?.items, meta: legacyResult?.meta },
      profile,
      { allowBlueprintPrices: false },
    );
  } else if (profile.catalogKind === 'menu_item') {
    logCompilerSelection(profile, 'MenuCatalogGenerator');
    compiled = generateMenuCatalog(legacyResult, profile);
  } else if (profile.catalogKind === 'mixed') {
    logCompilerSelection(profile, 'MixedCatalogGenerator');
    const stamped = stampServiceCatalogItems(legacyResult?.products ?? [], profile);
    compiled = {
      catalogKind: 'mixed',
      catalogItems: stamped,
      categories: legacyResult?.categories ?? [],
      meta: { ...(legacyResult?.meta ?? {}), catalogKind: 'mixed', businessCommerceProfile: profile },
    };
  } else {
    logCompilerSelection(profile, 'ProductCatalogGenerator');
    compiled = generateProductCatalog(legacyResult, profile);
  }

  const counts = countCatalogItemsByKind(compiled.catalogItems);
  const consistency = assertCatalogKindConsistency({
    businessCommerceProfile: profile,
    catalogItems: compiled.catalogItems,
    strict: opts.strict === true,
  });

  const result = {
    ...legacyResult,
    catalogKind: compiled.catalogKind,
    catalogItems: compiled.catalogItems,
    products: compiled.catalogItems,
    categories: compiled.categories ?? legacyResult?.categories,
    counts,
    meta: {
      ...(legacyResult?.meta ?? {}),
      ...(compiled.meta ?? {}),
      catalogKind: compiled.catalogKind,
      businessCommerceProfile: profile,
      catalogCounts: counts,
    },
  };

  if (!consistency.ok) {
    result.meta.catalogContractViolations = consistency.violations;
  }

  return result;
}

/**
 * Apply typed compiler to buildCatalog result when enabled.
 * @param {object} result
 * @param {object} params
 */
export function maybeCompileTypedCatalog(result, params = {}) {
  if (!isTypedCatalogCompilerEnabled() || !result) return result;
  return compileCatalogForStore(result, params, { strict: false });
}
