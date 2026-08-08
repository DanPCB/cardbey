/**
 * Provider SDK — adapter contract.
 * URI never imports vendor SDKs; Federation calls adapters only.
 */

import { PROVIDER_ADAPTER_METHODS } from '../types.js';

/**
 * Validate that an adapter implements the Provider SDK contract.
 * @param {object} adapter
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function validateAdapterContract(adapter) {
  const missing = [];
  if (!adapter || typeof adapter !== 'object') {
    return { ok: false, missing: [...PROVIDER_ADAPTER_METHODS, 'sourceId'] };
  }
  if (!adapter.sourceId) missing.push('sourceId');
  for (const m of PROVIDER_ADAPTER_METHODS) {
    if (typeof adapter[m] !== 'function') missing.push(m);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Default no-op stubs for optional adapter behaviours.
 */
export function withAdapterDefaults(partial) {
  const base = {
    async search() {
      return { ok: true, hits: [], query: null };
    },
    async fetchMetadata(remoteId) {
      return { ok: false, error: 'not_implemented', remoteId };
    },
    async checkRights() {
      return {
        ok: true,
        decision: 'SUGGESTED',
        commercialLicenseState: 'not_applicable',
        note: 'Rights Intelligence / Policy remain authority',
      };
    },
    async reusePolicy() {
      return {
        ok: true,
        custodyModes: ['REFERENCE_ONLY', 'PROVIDER_HOSTED', 'PULL_ON_USE'],
        mirror: false,
        downloadDefault: false,
      };
    },
    async preview(hit) {
      return { ok: true, previewUrl: hit?.previewUrl || null };
    },
    async retrieve() {
      return {
        ok: false,
        error: 'retrieve_disabled_by_default',
        note: 'Use Reuse Planner custody modes; no bulk binary pull',
      };
    },
    async health() {
      return { ok: true, status: 'ACTIVE', configured: false };
    },
  };
  return { ...base, ...partial };
}

/**
 * Assert contract or throw (used at registration time).
 */
export function assertAdapterContract(adapter) {
  const v = validateAdapterContract(adapter);
  if (!v.ok) {
    throw new Error(`provider_adapter_contract_invalid:${(v.missing || []).join(',')}`);
  }
  return true;
}
