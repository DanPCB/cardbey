/**
 * CTA copy/variant registry — multiple variants per capability.
 */

/** @type {Map<string, import('../sharedTypes/index.js').CtaVariant>} */
const variants = new Map();
/** @type {Map<string, string[]>} capabilityId → variant ids */
const byCapability = new Map();

/**
 * @param {import('../sharedTypes/index.js').CtaVariant} variant
 * @returns {import('../sharedTypes/index.js').CtaVariant}
 */
export function registerCtaVariant(variant) {
  if (!variant || typeof variant !== 'object') {
    throw new Error('registerCtaVariant: variant required');
  }
  const id = String(variant.id || '').trim();
  const capabilityId = String(variant.capabilityId || '').trim();
  if (!id) throw new Error('registerCtaVariant: id required');
  if (!capabilityId) throw new Error('registerCtaVariant: capabilityId required');
  if (!variant.label) throw new Error(`registerCtaVariant: label required for ${id}`);

  /** @type {import('../sharedTypes/index.js').CtaVariant} */
  const row = {
    weight: 1,
    placements: ['sticky', 'inline', 'section'],
    contexts: [],
    ...variant,
    id,
    capabilityId,
  };
  variants.set(id, row);
  const list = byCapability.get(capabilityId) ?? [];
  if (!list.includes(id)) list.push(id);
  byCapability.set(capabilityId, list);
  return row;
}

/**
 * @param {string} id
 * @returns {import('../sharedTypes/index.js').CtaVariant | null}
 */
export function getCtaVariant(id) {
  const key = String(id || '').trim();
  return key ? variants.get(key) ?? null : null;
}

/**
 * @param {string} capabilityId
 * @returns {import('../sharedTypes/index.js').CtaVariant[]}
 */
export function listVariantsForCapability(capabilityId) {
  const ids = byCapability.get(String(capabilityId || '').trim()) ?? [];
  return ids.map((id) => variants.get(id)).filter(Boolean);
}

/** @internal test helper */
export function _resetCtaRegistryForTests() {
  variants.clear();
  byCapability.clear();
}
