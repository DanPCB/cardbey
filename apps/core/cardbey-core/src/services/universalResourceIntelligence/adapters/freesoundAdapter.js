/**
 * Freesound — URI Provider SDK adapter wrapping existing freesoundClient.
 * Audio discovery only; no bulk download; attribution preserved.
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
import { searchFreesoundAudio } from '../../../lib/audio/freesoundClient.js';

export const FREESOUND_MANIFEST = Object.freeze({
  sourceId: 'src_freesound',
  name: 'Freesound',
  sourceKind: SOURCE_KIND.API,
  protocol: PROTOCOL.PROVIDER_ADAPTER,
  status: SOURCE_STATUS.ACTIVE,
  resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
  kinds: [RESOURCE_KIND.AUDIO],
  hostingMode: 'REFERENCE',
  rightsProfile: 'creative_commons',
  rateLimit: { perHour: 60 },
  consumerDiscoverable: true,
  commercial: false,
  authEnv: 'FREESOUND_API_KEY',
  liveSearch: true,
  metadata: { providerNumber: 6, media: 'audio' },
});

function configured() {
  return Boolean(process.env.FREESOUND_API_KEY?.trim());
}

function mapTrack(track) {
  return {
    id: String(track.providerTrackId || track.id),
    remoteId: String(track.providerTrackId || track.id),
    kind: RESOURCE_KIND.AUDIO,
    mediaType: RESOURCE_KIND.AUDIO,
    provider: 'freesound',
    title: track.title,
    previewUrl: track.previewUrl || null,
    url: track.previewUrl || null,
    downloadUrl: track.downloadUrl || track.previewUrl || null,
    canonicalUrl: track.sourceUrl || null,
    photographer: track.metadata?.freesound?.username || null,
    license: track.license || 'Creative Commons',
    attributionText: track.attribution || null,
    custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
    commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
    durationSec: track.duration,
    tags: track.tags || [],
  };
}

export const freesoundAdapter = withAdapterDefaults({
  sourceId: 'src_freesound',

  async search(input = {}) {
    const query = String(input.query || input.derivedQuery || '').trim();
    if (!query) return { ok: true, hits: [], query };
    if (!configured()) {
      return {
        ok: true,
        hits: [],
        query,
        configured: false,
        note: 'FREESOUND_API_KEY required',
      };
    }
    try {
      const { tracks } = await searchFreesoundAudio(query, {
        perPage: Math.min(Math.max(Number(input.limit) || 8, 1), 16),
      });
      return {
        ok: true,
        hits: (tracks || []).map(mapTrack),
        query,
        live: true,
        configured: true,
      };
    } catch (err) {
      const msg = String(err?.message || err);
      if (/429|rate/i.test(msg)) {
        return { ok: false, hits: [], query, code: 'RATE_LIMITED', error: msg };
      }
      return { ok: false, hits: [], query, error: msg, configured: true };
    }
  },

  async checkRights(hit) {
    return {
      ok: true,
      decision: 'SUGGESTED',
      commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
      license: hit?.license || null,
      attributionRequired: true,
      note: 'Freesound CC — Policy Engine remains authority',
    };
  },

  async reusePolicy() {
    return {
      ok: true,
      custodyModes: [CUSTODY_MODE.REFERENCE_ONLY, CUSTODY_MODE.PROVIDER_HOSTED],
      mirror: false,
      downloadDefault: false,
    };
  },

  async retrieve() {
    return {
      ok: false,
      error: 'retrieve_disabled_by_default',
      note: 'Rich Media Acquisition V1 prefers provider-hosted; no bulk binary pull',
    };
  },

  async health() {
    return {
      ok: true,
      status: configured() ? SOURCE_STATUS.ACTIVE : SOURCE_STATUS.DEGRADED,
      configured: configured(),
      liveSearch: configured(),
    };
  },
});
