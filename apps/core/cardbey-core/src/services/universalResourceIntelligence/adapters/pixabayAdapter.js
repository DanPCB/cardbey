/**
 * Pixabay — Class 1 open media. Requires PIXABAY_API_KEY.
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

const PIXABAY_API = 'https://pixabay.com/api/';
const PIXABAY_VIDEO_API = 'https://pixabay.com/api/videos/';

export const PIXABAY_MANIFEST = Object.freeze({
  sourceId: 'src_pixabay',
  name: 'Pixabay',
  sourceKind: SOURCE_KIND.API,
  protocol: PROTOCOL.PIXABAY_API,
  status: SOURCE_STATUS.ACTIVE,
  resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
  kinds: [RESOURCE_KIND.IMAGE, RESOURCE_KIND.VIDEO],
  hostingMode: 'REFERENCE',
  rightsProfile: 'pixabay_license',
  rateLimit: { perHour: 100 },
  consumerDiscoverable: true,
  commercial: false,
  authEnv: 'PIXABAY_API_KEY',
  liveSearch: true,
  metadata: { providerNumber: 3 },
});

function configured() {
  return Boolean(process.env.PIXABAY_API_KEY?.trim());
}

function adapterEnabled() {
  const raw = String(process.env.ENABLE_URI_ADAPTER_PIXABAY ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

export const pixabayAdapter = withAdapterDefaults({
  sourceId: 'src_pixabay',

  async search(input = {}) {
    const query = String(input.query || input.derivedQuery || '').trim();
    if (!query) return { ok: true, hits: [], query };
    if (!adapterEnabled() || !configured()) {
      return {
        ok: true,
        hits: [],
        query,
        configured: configured(),
        note: 'pixabay_not_configured',
      };
    }
    const key = process.env.PIXABAY_API_KEY.trim();
    const perPage = Math.min(Math.max(Number(input.limit) || 12, 1), 20);
    const wantVideo = input.mediaType === 'video' || input.kind === RESOURCE_KIND.VIDEO;
    try {
      const base = wantVideo ? PIXABAY_VIDEO_API : PIXABAY_API;
      const qs = new URLSearchParams({
        key,
        q: query,
        per_page: String(perPage),
        safesearch: 'true',
      });
      const res = await fetch(`${base}?${qs}`);
      if (!res.ok) return { ok: false, hits: [], query, error: `pixabay_http_${res.status}` };
      const data = await res.json();
      const hits = (data.hits || []).map((h) => {
        if (wantVideo) {
          const v = h.videos?.medium || h.videos?.small || h.videos?.tiny;
          return {
            id: String(h.id),
            remoteId: String(h.id),
            kind: RESOURCE_KIND.VIDEO,
            mediaType: RESOURCE_KIND.VIDEO,
            provider: 'pixabay',
            title: h.tags || `Pixabay video ${h.id}`,
            previewUrl: h.userImageURL || null,
            url: v?.url || null,
            downloadUrl: v?.url || null,
            canonicalUrl: h.pageURL || null,
            photographer: h.user,
            license: 'Pixabay License',
            attributionText: h.user ? `Video by ${h.user} on Pixabay` : 'Pixabay',
            custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
            commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
          };
        }
        return {
          id: String(h.id),
          remoteId: String(h.id),
          kind: RESOURCE_KIND.IMAGE,
          mediaType: RESOURCE_KIND.IMAGE,
          provider: 'pixabay',
          title: h.tags || `Pixabay ${h.id}`,
          previewUrl: h.previewURL || h.webformatURL || null,
          url: h.largeImageURL || h.webformatURL || null,
          downloadUrl: h.largeImageURL || h.webformatURL || null,
          canonicalUrl: h.pageURL || null,
          width: h.imageWidth,
          height: h.imageHeight,
          photographer: h.user,
          license: 'Pixabay License',
          attributionText: h.user ? `Image by ${h.user} on Pixabay` : 'Pixabay',
          custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
          commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
        };
      });
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
      provider: 'pixabay',
      resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
    };
  },
});
