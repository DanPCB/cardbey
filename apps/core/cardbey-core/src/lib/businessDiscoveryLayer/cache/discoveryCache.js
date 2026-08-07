/**
 * Namespaced in-memory discovery cache foundation.
 * Each namespace has its own Map — never store schema under projection, etc.
 */

import { isBusinessDiscoveryCacheV1Enabled } from '../flags.js';
import {
  DISCOVERY_CACHE_NAMESPACES,
  isDiscoveryCacheNamespace,
} from './discoveryCacheNamespaces.js';

/** @type {Map<string, Map<string, { value: unknown, expiresAt: number|null }>>} */
const stores = new Map();

function ensureStore(namespace) {
  if (!isDiscoveryCacheNamespace(namespace)) {
    throw new Error(`[businessDiscoveryLayer] Unknown cache namespace: ${namespace}`);
  }
  if (!stores.has(namespace)) stores.set(namespace, new Map());
  return stores.get(namespace);
}

/**
 * @param {string} namespace
 * @param {string} key
 * @param {unknown} value
 * @param {{ ttlMs?: number|null }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function setDiscoveryCache(namespace, key, value, opts = {}) {
  if (!isBusinessDiscoveryCacheV1Enabled()) {
    return { ok: false, reason: 'business_discovery_cache_disabled' };
  }
  if (typeof key !== 'string' || !key.trim()) {
    return { ok: false, reason: 'invalid_cache_key' };
  }
  const ttlMs = opts.ttlMs == null ? null : Number(opts.ttlMs);
  const expiresAt = ttlMs != null && Number.isFinite(ttlMs) ? Date.now() + ttlMs : null;
  ensureStore(namespace).set(key.trim(), { value, expiresAt });
  return { ok: true };
}

/**
 * @param {string} namespace
 * @param {string} key
 * @returns {{ hit: boolean, value?: unknown }}
 */
export function getDiscoveryCache(namespace, key) {
  if (!isBusinessDiscoveryCacheV1Enabled()) {
    return { hit: false };
  }
  const store = ensureStore(namespace);
  const entry = store.get(typeof key === 'string' ? key.trim() : '');
  if (!entry) return { hit: false };
  if (entry.expiresAt != null && Date.now() > entry.expiresAt) {
    store.delete(key.trim());
    return { hit: false };
  }
  return { hit: true, value: entry.value };
}

/**
 * @param {string} namespace
 * @param {string} [key] - omit to clear entire namespace
 */
export function invalidateDiscoveryCache(namespace, key) {
  if (!isDiscoveryCacheNamespace(namespace)) {
    throw new Error(`[businessDiscoveryLayer] Unknown cache namespace: ${namespace}`);
  }
  if (key == null) {
    stores.delete(namespace);
    return { ok: true, cleared: 'namespace' };
  }
  ensureStore(namespace).delete(String(key).trim());
  return { ok: true, cleared: 'key' };
}

/** Invalidate all discovery namespaces for a business key fragment. */
export function invalidateDiscoveryCachesForBusiness(businessId) {
  if (typeof businessId !== 'string' || !businessId.trim()) {
    return { ok: false, reason: 'invalid_business_id' };
  }
  const id = businessId.trim();
  let removed = 0;
  for (const ns of Object.values(DISCOVERY_CACHE_NAMESPACES)) {
    const store = stores.get(ns);
    if (!store) continue;
    for (const key of [...store.keys()]) {
      if (key.includes(id)) {
        store.delete(key);
        removed += 1;
      }
    }
  }
  return { ok: true, removed };
}

export function clearDiscoveryCachesForTests() {
  stores.clear();
}

export function discoveryCacheStats() {
  /** @type {Record<string, number>} */
  const sizes = {};
  for (const ns of Object.values(DISCOVERY_CACHE_NAMESPACES)) {
    sizes[ns] = stores.get(ns)?.size ?? 0;
  }
  return { namespaces: sizes };
}
