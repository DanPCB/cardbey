/**
 * Global Source Federation / Provider Registry — Phase 5.
 * Every discoverable origin is a Source Node. Adapters plug in via Provider SDK.
 */

import { PROTOCOL, RESOURCE_CLASS, SOURCE_KIND, SOURCE_STATUS } from './types.js';

/** @type {Map<string, object>} */
const nodes = new Map();
/** @type {Map<string, object>} */
const adapters = new Map();
/** @type {Map<string, object>} */
const healthBySource = new Map();
/** @type {Map<string, { windowStart: number, count: number }>} */
const rateWindows = new Map();

let seeded = false;

function seedDefaults() {
  if (seeded) return;
  seeded = true;
  const defaults = [
    {
      id: 'src_cardbey_library',
      kind: SOURCE_KIND.CARDBEY,
      name: 'Cardbey Universal Library',
      protocol: PROTOCOL.CARDBEY_LIBRARY,
      status: SOURCE_STATUS.ACTIVE,
      hostingMode: 'HOSTED_OR_REFERENCE',
      rightsProfile: 'per_asset',
      discoveryMode: 'index_query',
      rateLimit: null,
      resourceClass: RESOURCE_CLASS.CARDBEY,
      consumerDiscoverable: true,
      opsIntakeOnly: false,
      commercial: false,
      capabilities: { kinds: ['image', 'video', 'audio'], indexQuery: true },
      metadata: { consumer: 'universal_library', role: 'first_party_catalogue' },
    },
    {
      id: 'src_cardbey_capability',
      kind: SOURCE_KIND.CARDBEY,
      name: 'Cardbey Capability Engine',
      protocol: PROTOCOL.CARDBEY_CAPABILITY,
      status: SOURCE_STATUS.ACTIVE,
      hostingMode: 'REFERENCE',
      rightsProfile: 'capability_package',
      discoveryMode: 'index_query',
      resourceClass: RESOURCE_CLASS.CARDBEY,
      consumerDiscoverable: true,
      opsIntakeOnly: false,
      commercial: false,
      capabilities: { kinds: ['capability'], indexQuery: true },
      metadata: { consumer: 'capability_engine' },
    },
    {
      id: 'src_cardbey_originals',
      kind: SOURCE_KIND.CARDBEY,
      name: 'Cardbey Originals',
      protocol: PROTOCOL.CARDBEY_LIBRARY,
      status: SOURCE_STATUS.ACTIVE,
      hostingMode: 'HOSTED',
      rightsProfile: 'first_party',
      discoveryMode: 'index_query',
      resourceClass: RESOURCE_CLASS.CARDBEY,
      consumerDiscoverable: true,
      opsIntakeOnly: false,
      commercial: false,
      capabilities: { kinds: ['image', 'video'], indexQuery: true },
      metadata: { collection: 'cardbey-originals' },
    },
    {
      id: 'src_creator_studio',
      kind: SOURCE_KIND.CREATOR,
      name: 'Creator Studio projections',
      protocol: PROTOCOL.CREATOR_STUDIO,
      status: SOURCE_STATUS.ACTIVE,
      hostingMode: 'HOSTED',
      rightsProfile: 'creator_declaration',
      discoveryMode: 'index_query',
      resourceClass: RESOURCE_CLASS.CARDBEY,
      consumerDiscoverable: true,
      opsIntakeOnly: false,
      commercial: false,
      capabilities: { kinds: ['image', 'video'], indexQuery: true },
      metadata: { note: 'opt-in projections only' },
    },
    {
      id: 'src_manual',
      kind: SOURCE_KIND.MANUAL,
      name: 'Manual / partner intake',
      protocol: PROTOCOL.MANUAL,
      status: SOURCE_STATUS.PAUSED,
      hostingMode: 'VARIES',
      rightsProfile: 'fail_closed',
      discoveryMode: 'manual',
      resourceClass: RESOURCE_CLASS.BUSINESS,
      consumerDiscoverable: false,
      opsIntakeOnly: true,
      commercial: false,
      metadata: {},
    },
    // Commercial Class 5 stubs — registered, not discoverable until licensed
    {
      id: 'src_commercial_stub',
      kind: SOURCE_KIND.API,
      name: 'Commercial providers (stub)',
      protocol: PROTOCOL.PROVIDER_ADAPTER,
      status: SOURCE_STATUS.PAUSED,
      hostingMode: 'REFERENCE',
      rightsProfile: 'commercial',
      discoveryMode: 'adapter_search',
      resourceClass: RESOURCE_CLASS.COMMERCIAL,
      consumerDiscoverable: false,
      opsIntakeOnly: false,
      commercial: true,
      capabilities: {
        commercialLicenseStates: [
          'available',
          'not_licensed',
          'licensed',
          'subscription_required',
          'purchase_required',
        ],
      },
      metadata: { stub: true, note: 'Never treat as free' },
    },
  ];
  for (const n of defaults) {
    nodes.set(n.id, {
      ...n,
      registeredAt: new Date().toISOString(),
      circuitOpenUntil: null,
      lastError: null,
    });
  }
}

export function registerSourceNode(node) {
  seedDefaults();
  if (!node?.id) throw new Error('source_id_required');
  const prev = nodes.get(node.id);
  const next = {
    ...prev,
    ...node,
    kind: node.kind || prev?.kind || SOURCE_KIND.API,
    status: node.status || prev?.status || SOURCE_STATUS.PAUSED,
    resourceClass: node.resourceClass || prev?.resourceClass || RESOURCE_CLASS.OPEN_MEDIA,
    consumerDiscoverable:
      node.consumerDiscoverable !== undefined
        ? node.consumerDiscoverable
        : prev?.consumerDiscoverable !== undefined
          ? prev.consumerDiscoverable
          : true,
    opsIntakeOnly:
      node.opsIntakeOnly !== undefined ? node.opsIntakeOnly : Boolean(prev?.opsIntakeOnly),
    commercial: node.commercial !== undefined ? node.commercial : Boolean(prev?.commercial),
    capabilities: { ...(prev?.capabilities || {}), ...(node.capabilities || {}) },
    updatedAt: new Date().toISOString(),
    registeredAt: prev?.registeredAt || new Date().toISOString(),
    circuitOpenUntil: prev?.circuitOpenUntil || null,
    lastError: prev?.lastError || null,
  };
  nodes.set(node.id, next);
  return next;
}

export function attachAdapter(sourceId, adapter) {
  seedDefaults();
  adapters.set(sourceId, adapter);
}

export function getAdapter(sourceId) {
  seedDefaults();
  return adapters.get(sourceId) || null;
}

export function listAdapters() {
  seedDefaults();
  return [...adapters.keys()];
}

export function recordAdapterHealth(sourceId, health) {
  healthBySource.set(sourceId, {
    ...health,
    checkedAt: new Date().toISOString(),
  });
  const node = nodes.get(sourceId);
  if (node && health) {
    if (health.ok === false || health.status === 'DEGRADED') {
      node.lastError = health.error || health.status || 'degraded';
    } else {
      node.lastError = null;
    }
    if (health.status === 'PAUSED') node.status = SOURCE_STATUS.PAUSED;
    nodes.set(sourceId, node);
  }
}

export function openCircuit(sourceId, ms = 60_000) {
  const node = nodes.get(sourceId);
  if (!node) return;
  node.circuitOpenUntil = Date.now() + ms;
  node.status = SOURCE_STATUS.DEGRADED;
  nodes.set(sourceId, node);
}

export function isCircuitOpen(sourceId) {
  const node = nodes.get(sourceId);
  if (!node?.circuitOpenUntil) return false;
  if (Date.now() > node.circuitOpenUntil) {
    node.circuitOpenUntil = null;
    if (node.status === SOURCE_STATUS.DEGRADED) node.status = SOURCE_STATUS.ACTIVE;
    nodes.set(sourceId, node);
    return false;
  }
  return true;
}

/** Simple per-hour budget check using rateLimit.perHour when set. */
export function consumeRateBudget(sourceId) {
  const node = nodes.get(sourceId);
  const perHour = node?.rateLimit?.perHour;
  if (!perHour) return { ok: true };
  const now = Date.now();
  let win = rateWindows.get(sourceId);
  if (!win || now - win.windowStart > 3_600_000) {
    win = { windowStart: now, count: 0 };
  }
  if (win.count >= perHour) {
    return { ok: false, reason: 'rate_limit_exceeded', perHour };
  }
  win.count += 1;
  rateWindows.set(sourceId, win);
  return { ok: true, remaining: perHour - win.count };
}

export function getSourceNode(id) {
  seedDefaults();
  return nodes.get(id) || null;
}

export function listSourceNodes({ status, kind, protocol, resourceClass, consumerDiscoverable } = {}) {
  seedDefaults();
  return [...nodes.values()].filter((n) => {
    if (status && n.status !== status) return false;
    if (kind && n.kind !== kind) return false;
    if (protocol && n.protocol !== protocol) return false;
    if (resourceClass && n.resourceClass !== resourceClass) return false;
    if (consumerDiscoverable !== undefined && Boolean(n.consumerDiscoverable) !== consumerDiscoverable) {
      return false;
    }
    return true;
  });
}

export function listActiveSourcesForPlan() {
  return listSourceNodes({ status: SOURCE_STATUS.ACTIVE }).filter((n) => !n.opsIntakeOnly);
}

export function setSourceStatus(sourceId, status) {
  seedDefaults();
  const node = nodes.get(sourceId);
  if (!node) return null;
  node.status = status;
  node.updatedAt = new Date().toISOString();
  nodes.set(sourceId, node);
  return node;
}

export function federationHealth() {
  seedDefaults();
  const all = [...nodes.values()];
  return {
    ok: true,
    total: all.length,
    active: all.filter((n) => n.status === SOURCE_STATUS.ACTIVE).length,
    paused: all.filter((n) => n.status === SOURCE_STATUS.PAUSED).length,
    degraded: all.filter((n) => n.status === SOURCE_STATUS.DEGRADED).length,
    adapters: adapters.size,
    byKind: all.reduce((acc, n) => {
      acc[n.kind] = (acc[n.kind] || 0) + 1;
      return acc;
    }, {}),
    byResourceClass: all.reduce((acc, n) => {
      const c = n.resourceClass || 'UNKNOWN';
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {}),
    health: Object.fromEntries(healthBySource.entries()),
    providerSdk: true,
  };
}

/** Await before discovery / planning so Provider SDK adapters are registered. */
export async function ensureFederationReady() {
  seedDefaults();
  const { bootstrapProviderAdapters } = await import('./providerSdk/bootstrap.js');
  return bootstrapProviderAdapters();
}
