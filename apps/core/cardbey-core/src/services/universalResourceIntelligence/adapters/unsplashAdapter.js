/**
 * Unsplash — Class 1 open media. Requires UNSPLASH_ACCESS_KEY.
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

const UNSPLASH_SEARCH = 'https://api.unsplash.com/search/photos';

export const UNSPLASH_MANIFEST = Object.freeze({
  sourceId: 'src_unsplash',
  name: 'Unsplash',
  sourceKind: SOURCE_KIND.API,
  protocol: PROTOCOL.UNSPLASH_API,
  status: SOURCE_STATUS.ACTIVE,
  resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
  kinds: [RESOURCE_KIND.IMAGE],
  hostingMode: 'REFERENCE',
  rightsProfile: 'unsplash_license',
  rateLimit: { perHour: 50 },
  consumerDiscoverable: true,
  commercial: false,
  authEnv: 'UNSPLASH_ACCESS_KEY',
  liveSearch: true,
  metadata: { providerNumber: 4 },
});

function configured() {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY?.trim());
}

function adapterEnabled() {
  const raw = String(process.env.ENABLE_URI_ADAPTER_UNSPLASH ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

export const unsplashAdapter = withAdapterDefaults({
  sourceId: 'src_unsplash',

  async search(input = {}) {
    const query = String(input.query || input.derivedQuery || '').trim();
    if (!query) return { ok: true, hits: [], query };
    if (!adapterEnabled() || !configured()) {
      return {
        ok: true,
        hits: [],
        query,
        configured: configured(),
        note: 'unsplash_not_configured',
      };
    }
    const perPage = Math.min(Math.max(Number(input.limit) || 12, 1), 20);
    try {
      const qs = new URLSearchParams({
        query,
        per_page: String(perPage),
        orientation: input.orientation || 'landscape',
      });
      const res = await fetch(`${UNSPLASH_SEARCH}?${qs}`, {
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY.trim()}`,
          'Accept-Version': 'v1',
        },
      });
      if (!res.ok) return { ok: false, hits: [], query, error: `unsplash_http_${res.status}` };
      const data = await res.json();
      const hits = (data.results || []).map((p) => ({
        id: String(p.id),
        remoteId: String(p.id),
        kind: RESOURCE_KIND.IMAGE,
        mediaType: RESOURCE_KIND.IMAGE,
        provider: 'unsplash',
        title: p.description || p.alt_description || `Unsplash ${p.id}`,
        previewUrl: p.urls?.small || p.urls?.thumb || null,
        url: p.urls?.regular || p.urls?.full || null,
        downloadUrl: p.urls?.full || p.urls?.raw || null,
        canonicalUrl: p.links?.html || null,
        width: p.width,
        height: p.height,
        photographer: p.user?.name,
        photographerUrl: p.user?.links?.html,
        license: 'Unsplash License',
        attributionText: p.user?.name ? `Photo by ${p.user.name} on Unsplash` : 'Unsplash',
        custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
        commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
      }));
      return { ok: true, hits, query, live: true, configured: true };
    } catch (err) {
      return { ok: false, hits: [], query, error: String(err?.message || err) };
    }
  },

  async health() {
    return {
      ok: true,
      status: configured() && adapterEnabled() ? 'ACTIVE' : 'DEGRADED',
      configured: configured(),
      liveSearch: configured() && adapterEnabled(),
      provider: 'unsplash',
      resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
    };
  },
});
