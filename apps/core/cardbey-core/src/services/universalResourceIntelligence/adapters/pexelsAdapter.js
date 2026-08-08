/**
 * Pexels — Provider #1. Implements Provider SDK contract.
 * Live search when PEXELS_API_KEY is set; otherwise empty hits (index path via discovery).
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

const PEXELS_PHOTOS = 'https://api.pexels.com/v1/search';
const PEXELS_VIDEOS = 'https://api.pexels.com/videos/search';

export const PEXELS_MANIFEST = Object.freeze({
  sourceId: 'src_pexels',
  name: 'Pexels',
  sourceKind: SOURCE_KIND.API,
  protocol: PROTOCOL.PEXELS_API,
  status: SOURCE_STATUS.ACTIVE,
  resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
  kinds: [RESOURCE_KIND.IMAGE, RESOURCE_KIND.VIDEO],
  hostingMode: 'REFERENCE',
  rightsProfile: 'pexels_license',
  rateLimit: { perHour: 200 },
  consumerDiscoverable: true,
  commercial: false,
  authEnv: 'PEXELS_API_KEY',
  liveSearch: true,
  metadata: {
    termsDoc: 'docs/providers/PEXELS_RIGHTS_AND_INTEGRATION_REVIEW.md',
    pilotApproved: true,
    providerNumber: 1,
  },
});

function configured() {
  return Boolean(process.env.PEXELS_API_KEY?.trim());
}

async function pexelsFetch(url, params) {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) throw new Error('pexels_not_configured');
  const qs = new URLSearchParams(params);
  const res = await fetch(`${url}?${qs}`, { headers: { Authorization: apiKey } });
  if (res.status === 429) {
    const err = new Error('pexels_rate_limited');
    err.code = 'RATE_LIMITED';
    throw err;
  }
  if (!res.ok) throw new Error(`pexels_http_${res.status}`);
  return res.json();
}

function mapPhoto(p) {
  return {
    id: String(p.id),
    remoteId: String(p.id),
    kind: RESOURCE_KIND.IMAGE,
    mediaType: RESOURCE_KIND.IMAGE,
    provider: 'pexels',
    title: p.alt || `Pexels photo ${p.id}`,
    previewUrl: p.src?.medium || p.src?.tiny || null,
    url: p.src?.large || p.src?.original || null,
    fullUrl: p.src?.original || p.src?.large || null,
    downloadUrl: p.src?.original || p.src?.large || null,
    canonicalUrl: p.url || null,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    license: 'Pexels License',
    attributionText: p.photographer ? `Photo by ${p.photographer} on Pexels` : 'Pexels',
    custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
    commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
  };
}

function mapVideo(v) {
  const files = Array.isArray(v.video_files) ? v.video_files : [];
  const best =
    files.find((f) => f.quality === 'hd') ||
    files.find((f) => f.quality === 'sd') ||
    files[0];
  return {
    id: String(v.id),
    remoteId: String(v.id),
    kind: RESOURCE_KIND.VIDEO,
    mediaType: RESOURCE_KIND.VIDEO,
    provider: 'pexels',
    title: v.user?.name ? `Video by ${v.user.name}` : `Pexels video ${v.id}`,
    previewUrl: v.image || null,
    url: best?.link || null,
    downloadUrl: best?.link || null,
    canonicalUrl: v.url || null,
    width: v.width,
    height: v.height,
    durationSec: v.duration,
    photographer: v.user?.name,
    photographerUrl: v.user?.url,
    license: 'Pexels License',
    attributionText: v.user?.name ? `Video by ${v.user.name} on Pexels` : 'Pexels',
    custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
    commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
    mimeType: 'video/mp4',
  };
}

export const pexelsAdapter = withAdapterDefaults({
  sourceId: 'src_pexels',

  async search(input = {}) {
    const query = String(input.query || input.derivedQuery || '').trim();
    if (!query) return { ok: true, hits: [], query, note: 'empty_query' };
    if (!configured()) {
      return {
        ok: true,
        hits: [],
        query,
        configured: false,
        note: 'pexels_not_configured_use_index_fallback',
      };
    }

    const wantVideo =
      input.mediaType === 'video' ||
      input.kind === RESOURCE_KIND.VIDEO ||
      /video|footage|clip/i.test(query);
    const perPage = Math.min(Math.max(Number(input.limit) || 12, 1), 24);

    try {
      if (wantVideo) {
        const data = await pexelsFetch(PEXELS_VIDEOS, {
          query,
          per_page: String(perPage),
          page: '1',
        });
        return {
          ok: true,
          hits: (data.videos || []).map(mapVideo),
          query,
          configured: true,
          live: true,
        };
      }
      const data = await pexelsFetch(PEXELS_PHOTOS, {
        query,
        per_page: String(perPage),
        page: '1',
        orientation: input.orientation || undefined,
      });
      return {
        ok: true,
        hits: (data.photos || []).map(mapPhoto),
        query,
        configured: true,
        live: true,
      };
    } catch (err) {
      return {
        ok: false,
        hits: [],
        query,
        error: String(err?.message || err),
        code: err?.code || null,
      };
    }
  },

  async checkRights() {
    return {
      ok: true,
      decision: 'SUGGESTED',
      license: 'Pexels License',
      commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
      attributionRequired: true,
      note: 'Policy engine remains authority',
    };
  },

  async reusePolicy() {
    return {
      ok: true,
      custodyModes: [
        CUSTODY_MODE.REFERENCE_ONLY,
        CUSTODY_MODE.PROVIDER_HOSTED,
        CUSTODY_MODE.PULL_ON_USE,
      ],
      mirror: false,
      downloadDefault: false,
      marketplaceResale: false,
    };
  },

  async health() {
    return {
      ok: true,
      status: configured() ? 'ACTIVE' : 'DEGRADED',
      configured: configured(),
      liveSearch: configured(),
      provider: 'pexels',
      resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
    };
  },
});
