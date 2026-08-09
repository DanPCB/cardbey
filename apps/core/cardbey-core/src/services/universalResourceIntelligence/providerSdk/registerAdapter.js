/**
 * Bind capability manifest + adapter to Source Federation registry.
 */

import { assertAdapterContract } from './adapterContract.js';
import {
  registerSourceNode,
  attachAdapter,
  recordAdapterHealth,
} from '../sourceFederation.js';
import { PROTOCOL, RESOURCE_CLASS, SOURCE_KIND, SOURCE_STATUS } from '../types.js';

/**
 * @param {object} manifest
 * @param {object} adapter — must satisfy Provider SDK contract
 */
export function registerProviderAdapter(manifest, adapter) {
  if (!manifest?.sourceId) throw new Error('manifest_sourceId_required');
  const bound = {
    ...adapter,
    sourceId: manifest.sourceId,
    manifest,
  };
  assertAdapterContract(bound);

  const node = registerSourceNode({
    id: manifest.sourceId,
    kind: manifest.sourceKind || SOURCE_KIND.API,
    name: manifest.name || manifest.sourceId,
    protocol: manifest.protocol || PROTOCOL.PROVIDER_ADAPTER,
    status: manifest.status || SOURCE_STATUS.ACTIVE,
    hostingMode: manifest.hostingMode || 'REFERENCE',
    rightsProfile: manifest.rightsProfile || 'fail_closed',
    discoveryMode: 'adapter_search',
    rateLimit: manifest.rateLimit || null,
    resourceClass: manifest.resourceClass || RESOURCE_CLASS.OPEN_MEDIA,
    consumerDiscoverable: manifest.consumerDiscoverable !== false,
    opsIntakeOnly: Boolean(manifest.opsIntakeOnly),
    commercial: Boolean(manifest.commercial),
    capabilities: {
      kinds: manifest.kinds || [],
      mediaTypes: manifest.kinds || [],
      liveSearch: manifest.liveSearch !== false,
      indexQuery: Boolean(manifest.indexQuery),
      commercialLicenseStates: manifest.commercialLicenseStates || [],
    },
    metadata: {
      ...(manifest.metadata || {}),
      resourceClass: manifest.resourceClass || RESOURCE_CLASS.OPEN_MEDIA,
      authEnv: manifest.authEnv || null,
      adapter: true,
      providerSdk: true,
    },
  });

  attachAdapter(manifest.sourceId, bound);
  return { ok: true, node, adapter: bound };
}

/**
 * Run adapter.health and persist onto registry.
 */
export async function refreshAdapterHealth(sourceId) {
  const { getAdapter } = await import('../sourceFederation.js');
  const adapter = getAdapter(sourceId);
  if (!adapter?.health) {
    return { ok: false, error: 'adapter_not_found' };
  }
  try {
    const h = await adapter.health();
    recordAdapterHealth(sourceId, h);
    return { ok: true, health: h };
  } catch (err) {
    const h = { ok: false, status: 'DEGRADED', error: String(err?.message || err) };
    recordAdapterHealth(sourceId, h);
    return { ok: false, health: h };
  }
}
