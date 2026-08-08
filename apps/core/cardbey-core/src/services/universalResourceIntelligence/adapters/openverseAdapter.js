/**
 * Openverse — Class 1 open media aggregator (Creative Commons).
 * https://api.openverse.org/
 */

import { withAdapterDefaults } from '../providerSdk/adapterContract.js';
import {
  COMMERCIAL_LICENSE_STATE,
  CUSTODY_MODE,
  PROTOCOL,
  RESOURCE_CLASS,
  RESOURCE_KIND,
  SOURCE_KIND,
  SOURCE_STATUS,
} from '../types.js';

const OPENVERSE_IMAGES = 'https://api.openverse.org/v1/images/';
const OPENVERSE_AUDIO = 'https://api.openverse.org/v1/audio/';

export const OPENVERSE_MANIFEST = Object.freeze({
  sourceId: 'src_openverse',
  name: 'Openverse',
  sourceKind: SOURCE_KIND.API,
  protocol: PROTOCOL.OPENVERSE_API,
  status: SOURCE_STATUS.ACTIVE,
  resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
  kinds: [RESOURCE_KIND.IMAGE, RESOURCE_KIND.AUDIO],
  hostingMode: 'REFERENCE',
  rightsProfile: 'creative_commons',
  rateLimit: { perHour: 100 },
  consumerDiscoverable: true,
  commercial: false,
  authEnv: null,
  liveSearch: true,
  metadata: { aggregates: true, providerNumber: 2 },
});

function adapterEnabled() {
  const raw = String(process.env.ENABLE_URI_ADAPTER_OPENVERSE ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

function mapImage(item) {
  return {
    id: String(item.id),
    remoteId: String(item.id),
    kind: RESOURCE_KIND.IMAGE,
    mediaType: RESOURCE_KIND.IMAGE,
    provider: 'openverse',
    title: item.title || `Openverse ${item.id}`,
    previewUrl: item.thumbnail || item.url || null,
    url: item.url || null,
    downloadUrl: item.url || null,
    canonicalUrl: item.foreign_landing_url || item.detail_url || null,
    photographer: item.creator,
    photographerUrl: item.creator_url,
    license: item.license_version
      ? `${item.license} ${item.license_version}`
      : item.license || 'CC',
    attributionText: item.attribution || null,
    custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
    commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
    tags: (item.tags || []).map((t) => t.name || t).filter(Boolean),
  };
}

export const openverseAdapter = withAdapterDefaults({
  sourceId: 'src_openverse',

  async search(input = {}) {
    const query = String(input.query || input.derivedQuery || '').trim();
    if (!query) return { ok: true, hits: [], query };
    if (!adapterEnabled()) {
      return { ok: true, hits: [], query, note: 'adapter_disabled' };
    }
    const perPage = Math.min(Math.max(Number(input.limit) || 12, 1), 20);
    const wantAudio = input.mediaType === 'audio' || input.kind === RESOURCE_KIND.AUDIO;
    const endpoint = wantAudio ? OPENVERSE_AUDIO : OPENVERSE_IMAGES;
    try {
      const qs = new URLSearchParams({
        q: query,
        page_size: String(perPage),
        license_type: 'commercial,modification',
      });
      const res = await fetch(`${endpoint}?${qs}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'CardbeyURI/1.0' },
      });
      if (!res.ok) {
        return { ok: false, hits: [], query, error: `openverse_http_${res.status}` };
      }
      const data = await res.json();
      const results = data.results || [];
      return {
        ok: true,
        hits: results.map(mapImage),
        query,
        live: true,
        configured: true,
      };
    } catch (err) {
      return { ok: false, hits: [], query, error: String(err?.message || err) };
    }
  },

  async checkRights() {
    return {
      ok: true,
      decision: 'SUGGESTED',
      license: 'Creative Commons (varies per item)',
      commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
      attributionRequired: true,
      note: 'Per-item license must be revalidated',
    };
  },

  async reusePolicy() {
    return {
      ok: true,
      custodyModes: [CUSTODY_MODE.REFERENCE_ONLY, CUSTODY_MODE.PROVIDER_HOSTED, CUSTODY_MODE.PULL_ON_USE],
      mirror: false,
      downloadDefault: false,
    };
  },

  async health() {
    return {
      ok: true,
      status: adapterEnabled() ? 'ACTIVE' : 'PAUSED',
      configured: true,
      liveSearch: adapterEnabled(),
      provider: 'openverse',
      resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
    };
  },
});
