/**
 * Bounded required-field policy for storefront pilot readiness (Stage 5A).
 */

/** @typedef {'identity_required'|'commerce_required'|'recommended'|'optional'} TranslationFieldImportance */

/**
 * @typedef {Object} TranslationFieldDescriptor
 * @property {string} path
 * @property {string} entityType  store | product
 * @property {string} field
 * @property {TranslationFieldImportance} importance
 * @property {boolean} [translationNotRequired]
 */

/** Pilot required descriptors (catalog entities filled at evaluation time). */
export const PILOT_STORE_FIELD_POLICY = Object.freeze([
  Object.freeze({
    path: 'store.name',
    entityType: 'store',
    field: 'name',
    importance: 'identity_required',
    // Brand/legal names may remain canonical
    translationNotRequired: true,
  }),
  Object.freeze({
    path: 'store.description',
    entityType: 'store',
    field: 'description',
    importance: 'identity_required',
    translationNotRequired: false,
  }),
]);

export const PILOT_PRODUCT_FIELD_POLICY = Object.freeze([
  Object.freeze({
    path: 'product.name',
    entityType: 'product',
    field: 'name',
    importance: 'commerce_required',
    translationNotRequired: false,
  }),
  Object.freeze({
    path: 'product.description',
    entityType: 'product',
    field: 'description',
    importance: 'recommended',
    translationNotRequired: false,
  }),
  Object.freeze({
    path: 'product.category',
    entityType: 'product',
    field: 'category',
    importance: 'commerce_required',
    translationNotRequired: false,
  }),
]);

/**
 * Expand policy against a store + products snapshot.
 * @param {{ storeId: string, products?: object[] }} input
 * @returns {TranslationFieldDescriptor[]}
 */
export function expandPilotRequiredFields(input = {}) {
  /** @type {TranslationFieldDescriptor[]} */
  const out = [...PILOT_STORE_FIELD_POLICY];
  const products = Array.isArray(input.products) ? input.products : [];
  for (const p of products) {
    if (!p?.id) continue;
    for (const base of PILOT_PRODUCT_FIELD_POLICY) {
      out.push(
        Object.freeze({
          ...base,
          path: `product.${p.id}.${base.field}`,
          entityId: String(p.id),
        }),
      );
    }
  }
  return out;
}
