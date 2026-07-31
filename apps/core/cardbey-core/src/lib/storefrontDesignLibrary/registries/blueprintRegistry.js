import { assertStorefrontBlueprint } from '../contracts/blueprint.js';

/** @type {Map<string, import('../contracts/blueprint.js').StorefrontBlueprint>} */
const store = new Map();
let sealed = false;

function assertOpen() {
  if (sealed) {
    throw new Error('[storefrontDesignLibrary] Blueprint registry is sealed; runtime mutation is not allowed');
  }
}

/**
 * @param {unknown} definition
 */
export function registerBlueprint(definition) {
  assertOpen();
  const bp = assertStorefrontBlueprint(definition);
  if (store.has(bp.id)) {
    throw new Error(`[storefrontDesignLibrary] Duplicate blueprint id "${bp.id}"`);
  }
  store.set(bp.id, bp);
  return bp;
}

/** @param {string} id */
export function getBlueprint(id) {
  const key = String(id ?? '').trim();
  return store.get(key) ?? null;
}

export function listBlueprints() {
  return Object.freeze([...store.values()]);
}

/** @param {string} id */
export function hasBlueprint(id) {
  return store.has(String(id ?? '').trim());
}

export function sealBlueprintRegistry() {
  sealed = true;
}

/** @internal test helper */
export function __resetBlueprintRegistryForTests() {
  store.clear();
  sealed = false;
}
