/**
 * Wikimedia Commons — Class 1 open media (MediaWiki API).
 * https://commons.wikimedia.org/wiki/Commons:API
 *
 * Requires a descriptive User-Agent (Wikimedia policy).
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

const API = 'https://commons.wikimedia.org/w/api.php';

export const WIKIMEDIA_MANIFEST = Object.freeze({
  sourceId: 'src_wikimedia',
  name: 'Wikimedia Commons',
  sourceKind: SOURCE_KIND.API,
  protocol: PROTOCOL.WIKIMEDIA_COMMONS_API,
  status: SOURCE_STATUS.ACTIVE,
  resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
  kinds: [RESOURCE_KIND.IMAGE],
  hostingMode: 'REFERENCE',
  rightsProfile: 'wikimedia_per_file',
  rateLimit: { perHour: 200 },
  consumerDiscoverable: true,
  commercial: false,
  authEnv: null,
  liveSearch: true,
  metadata: { userAgentRequired: true, providerNumber: 3 },
});

function adapterEnabled() {
  const raw = String(process.env.ENABLE_URI_ADAPTER_WIKIMEDIA ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

export function wikimediaUserAgent() {
  const custom = String(process.env.WIKIMEDIA_USER_AGENT || '').trim();
  if (custom) return custom;
  const contact = String(process.env.WIKIMEDIA_CONTACT || process.env.PUBLIC_SUPPORT_EMAIL || '').trim();
  return contact
    ? `CardbeyURI/1.0 (${contact})`
    : 'CardbeyURI/1.0 (https://cardbey.com; open-media federation)';
}

function mapPage(page) {
  const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  const ext = info?.extmetadata || {};
  const licenseShort = ext.LicenseShortName?.value || ext.License?.value || '';
  const artist = stripHtml(ext.Artist?.value || ext.Credit?.value || info?.user || '');
  const description = stripHtml(ext.ImageDescription?.value || page.title || '');
  const title = String(page.title || '').replace(/^File:/i, '');
  const thumb = info?.thumburl || info?.url || null;
  return {
    id: String(page.pageid || title),
    remoteId: String(page.pageid || title),
    kind: RESOURCE_KIND.IMAGE,
    mediaType: RESOURCE_KIND.IMAGE,
    provider: 'wikimedia',
    title: title || description.slice(0, 80) || `Commons ${page.pageid}`,
    previewUrl: thumb,
    url: info?.url || null,
    downloadUrl: info?.url || null,
    canonicalUrl: page.canonicalurl || page.fullurl || null,
    photographer: artist || null,
    photographerUrl: null,
    license: licenseShort || null,
    licenseUrl: ext.LicenseUrl?.value || null,
    attributionText: artist ? `${artist} / Wikimedia Commons` : 'Wikimedia Commons',
    custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
    commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
    width: info?.width,
    height: info?.height,
    mimeType: info?.mime || null,
    description,
    tags: [],
  };
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function commonsSearch(query, limit) {
  const qs = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: 'imageinfo|info',
    inprop: 'url',
    iiprop: 'url|size|mime|extmetadata|user',
    iiurlwidth: '640',
  });
  const res = await fetch(`${API}?${qs}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': wikimediaUserAgent(),
    },
  });
  return res;
}

export const wikimediaCommonsAdapter = withAdapterDefaults({
  sourceId: 'src_wikimedia',

  async search(input = {}) {
    const query = String(input.query || input.derivedQuery || '').trim();
    if (!query) return { ok: true, hits: [], query };
    if (!adapterEnabled()) {
      return { ok: true, hits: [], query, note: 'adapter_disabled' };
    }
    const perPage = Math.min(Math.max(Number(input.limit) || 12, 1), 20);
    try {
      const res = await commonsSearch(query, perPage);
      if (!res.ok) {
        return { ok: false, hits: [], query, error: `wikimedia_http_${res.status}` };
      }
      const data = await res.json();
      const pages = data?.query?.pages || {};
      const hits = Object.values(pages)
        .filter((p) => p && !p.missing)
        .map(mapPage)
        .filter((h) => h.previewUrl || h.url);
      return { ok: true, hits, query, live: true, configured: true };
    } catch (err) {
      return { ok: false, hits: [], query, error: String(err?.message || err) };
    }
  },

  async checkRights() {
    return {
      ok: true,
      decision: 'SUGGESTED',
      license: 'Per-file Wikimedia licence (must revalidate)',
      commercialLicenseState: COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
      attributionRequired: true,
      note: 'Fail closed when licence cannot be confidently classified',
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

  async health() {
    if (!adapterEnabled()) {
      return { ok: true, status: 'PAUSED', configured: true, liveSearch: false, provider: 'wikimedia' };
    }
    try {
      const res = await commonsSearch('bakery', 1);
      if (res.status === 403 || res.status === 429) {
        return {
          ok: false,
          status: res.status === 429 ? 'RATE_LIMITED' : 'AUTH_ERROR',
          configured: true,
          httpStatus: res.status,
          provider: 'wikimedia',
        };
      }
      return {
        ok: res.ok,
        status: res.ok ? 'ACTIVE' : 'UPSTREAM_ERROR',
        configured: true,
        liveSearch: res.ok,
        provider: 'wikimedia',
        resourceClass: RESOURCE_CLASS.OPEN_MEDIA,
        userAgent: wikimediaUserAgent().slice(0, 80),
      };
    } catch (err) {
      return {
        ok: false,
        status: 'NETWORK_ERROR',
        configured: true,
        error: String(err?.message || err),
        provider: 'wikimedia',
      };
    }
  },
});
