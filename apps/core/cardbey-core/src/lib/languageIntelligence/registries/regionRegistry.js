import { assertRegionProfile } from '../contracts/regionProfile.js';

/** @type {Map<string, import('../contracts/regionProfile.js').RegionProfile>} */
const store = new Map();
let sealed = false;

function assertOpen() {
  if (sealed) {
    throw new Error('[languageIntelligence] Region registry is sealed; runtime mutation is not allowed');
  }
}

/**
 * @param {unknown} definition
 */
export function registerRegion(definition) {
  assertOpen();
  const profile = assertRegionProfile(definition);
  const id = profile.id.trim().toUpperCase();
  if (store.has(id)) {
    throw new Error(`[languageIntelligence] Duplicate region id "${id}"`);
  }
  const frozen = Object.freeze({ ...profile, id });
  store.set(id, frozen);
  return frozen;
}

/** @param {string} id */
export function getRegion(id) {
  return store.get(String(id ?? '').trim().toUpperCase()) ?? null;
}

export function listRegions() {
  return Object.freeze([...store.values()]);
}

/** @param {string} id */
export function hasRegion(id) {
  return store.has(String(id ?? '').trim().toUpperCase());
}

export function sealRegionRegistry() {
  sealed = true;
}

/** @internal */
export function __resetRegionRegistryForTests() {
  store.clear();
  sealed = false;
}
