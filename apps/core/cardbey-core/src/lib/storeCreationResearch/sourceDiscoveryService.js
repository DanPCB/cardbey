/**
 * Discover public sources for store-creation research.
 * Only uses permitted sources: user-supplied URLs, Google Places API, uploaded OCR.
 */

import {
  extractFromWebsite,
  fromManualInput,
  searchGooglePlaces,
  fetchGooglePlaceDetails,
  isGooglePlacesConfigured,
  getGooglePlacesApiMode,
  getGooglePlacesApiStatus,
} from '../businessDiscovery/businessDiscoverySources.js';
import { normalizeWebsite, cleanString } from '../businessDiscovery/businessDataNormalizer.js';
import { discoverBookwellVenueSource } from './bookwellVenueDiscovery.js';
import { resolveStoreResearchInputFields } from './researchInputFields.js';
import { RESEARCH_LOG } from './types.js';

/** @type {import('./types.js').DiscoveredSource['sourceType'][]} */
const SOURCE_PRIORITY = [
  'official_website',
  'google_business',
  'facebook',
  'instagram',
  'booking_platform',
  'directory',
  'review_site',
  'uploaded_document',
  'manual',
];

const BOOKING_HOST_RE =
  /\b(booksy|fresha|bookwell|square\.site|squareup\.com\/appointments|acuityscheduling|setmore|simplybook|mindbodyonline|treatwell)\b/i;

/**
 * @param {import('./types.js').DiscoveredSource[]} discovered
 * @param {Record<string, string>} socialLinks
 * @param {string} businessName
 * @param {number} priorityStart
 * @param {(msg: string, meta?: object) => void} log
 */
function pushDiscoveredSocialLinks(discovered, socialLinks, businessName, priorityStart, log) {
  if (!socialLinks || typeof socialLinks !== 'object') return priorityStart;
  let priority = priorityStart;
  for (const [platform, url] of Object.entries(socialLinks)) {
    const normalized = normalizeWebsite(url);
    if (!normalized) continue;
    const sourceType = /facebook/i.test(platform) || /facebook\.com/i.test(normalized)
      ? 'facebook'
      : /instagram/i.test(platform) || /instagram\.com/i.test(normalized)
        ? 'instagram'
        : 'directory';
    discovered.push({
      sourceType,
      sourceUrl: normalized,
      raw: { website: normalized, name: businessName, socialPlatform: platform },
      priority: priority++,
    });
    log(RESEARCH_LOG.SOURCE_DISCOVERED, { sourceType, sourceUrl: normalized, via: 'google_place_website' });
  }
  return priority;
}

/**
 * @param {import('./types.js').StoreCreationResearchInput} input
 * @param {(msg: string, meta?: object) => void} [log]
 * @returns {Promise<import('./types.js').DiscoveredSource[]>}
 */
export async function discoverSources(input, log = defaultLog) {
  const fields = resolveStoreResearchInputFields({}, input);
  const discovered = [];
  let priority = 0;

  const website = fields.website;
  if (website) {
    const results = await extractFromWebsite(website);
    for (const r of results) {
      discovered.push({
        sourceType: 'official_website',
        sourceUrl: website,
        raw: r.raw ?? {},
        priority: priority++,
      });
      log(RESEARCH_LOG.SOURCE_DISCOVERED, { sourceType: 'official_website', sourceUrl: website });
    }
  }

  const name = fields.businessName;
  const location = fields.location;
  if (name && !isGooglePlacesConfigured()) {
    log('[STORE_RESEARCH_GOOGLE_PLACES_SKIPPED]', { reason: 'not_configured' });
  }
  if (name && isGooglePlacesConfigured()) {
    const places = await searchGooglePlaces(name, location);
    if (!places.length) {
      log('[STORE_RESEARCH_GOOGLE_PLACES_EMPTY]', {
        apiMode: getGooglePlacesApiMode(),
        status: getGooglePlacesApiStatus(),
      });
    } else {
      log('[STORE_RESEARCH_GOOGLE_PLACES_FOUND]', {
        count: places.length,
        apiMode: getGooglePlacesApiMode(),
        topName: places[0]?.raw?.name ?? null,
      });
    }
    for (const p of places) {
      let raw = { ...(p.raw ?? {}) };
      const placeId = raw.placeId ?? raw.sourceId ?? null;
      if (placeId) {
        const details = await fetchGooglePlaceDetails(String(placeId));
        if (details) {
          raw = { ...raw, ...details };
          if (details.website && !website) {
            const webResults = await extractFromWebsite(String(details.website));
            for (const r of webResults) {
              const mergedRaw = { ...(r.raw ?? {}), ...details };
              discovered.push({
                sourceType: 'official_website',
                sourceUrl: String(details.website),
                raw: mergedRaw,
                priority: priority++,
              });
              log(RESEARCH_LOG.SOURCE_DISCOVERED, {
                sourceType: 'official_website',
                sourceUrl: details.website,
                via: 'google_place_details',
              });
              priority = pushDiscoveredSocialLinks(
                discovered,
                mergedRaw.socialLinks,
                name,
                priority,
                log,
              );
            }
          }
        }
      }
      discovered.push({
        sourceType: 'google_business',
        sourceUrl: p.attribution?.sourceUrl ?? raw.googleMapsUri ?? null,
        raw,
        priority: priority++,
      });
      log(RESEARCH_LOG.SOURCE_DISCOVERED, {
        sourceType: 'google_business',
        sourceUrl: p.attribution?.sourceUrl ?? raw.googleMapsUri ?? null,
        placeId: raw.placeId ?? null,
        via: raw.discoveryVia ?? 'google_places',
      });
    }
  }

  const social = fields.socialLinks && typeof fields.socialLinks === 'object' ? fields.socialLinks : {};
  for (const [platform, url] of Object.entries(social)) {
    const normalized = normalizeWebsite(url);
    if (!normalized) continue;
    const sourceType = /facebook/i.test(platform) || /facebook\.com/i.test(normalized)
      ? 'facebook'
      : /instagram/i.test(platform) || /instagram\.com/i.test(normalized)
        ? 'instagram'
        : 'directory';
    discovered.push({
      sourceType,
      sourceUrl: normalized,
      raw: { website: normalized, name, socialPlatform: platform },
      priority: priority++,
    });
    log(RESEARCH_LOG.SOURCE_DISCOVERED, { sourceType, sourceUrl: normalized });
  }

  if (website && BOOKING_HOST_RE.test(website)) {
    const bookingResults = await extractFromWebsite(website);
    if (bookingResults.length) {
      for (const r of bookingResults) {
        discovered.push({
          sourceType: 'booking_platform',
          sourceUrl: website,
          raw: { ...(r.raw ?? {}), website, name },
          priority: priority++,
        });
      }
    } else {
      discovered.push({
        sourceType: 'booking_platform',
        sourceUrl: website,
        raw: { website, name },
        priority: priority++,
      });
    }
    log(RESEARCH_LOG.SOURCE_DISCOVERED, { sourceType: 'booking_platform', sourceUrl: website });
  }

  if (name && !website) {
    const bookwell = await discoverBookwellVenueSource(name, location, fields.category);
    if (bookwell) {
      discovered.push({ ...bookwell, priority: priority++ });
      log(RESEARCH_LOG.SOURCE_DISCOVERED, {
        sourceType: 'booking_platform',
        sourceUrl: bookwell.sourceUrl,
        via: 'bookwell_listing',
        offerCount: Array.isArray(bookwell.raw?.offers) ? bookwell.raw.offers.length : 0,
      });
    }
  }

  if (input.ocrText && String(input.ocrText).trim()) {
    const parsed = parseBusinessCardText(input.ocrText);
    discovered.push({
      sourceType: 'uploaded_document',
      sourceUrl: null,
      raw: parsed,
      priority: priority++,
    });
    log(RESEARCH_LOG.SOURCE_DISCOVERED, { sourceType: 'uploaded_document' });
  }

  if (name || location || fields.phone || fields.email) {
    const manual = fromManualInput(
      {
        name,
        businessName: name,
        location,
        phone: fields.phone ?? null,
        email: fields.email ?? null,
        website,
        category: fields.category ?? null,
      },
      'manual',
      website,
    );
    discovered.push({
      sourceType: 'manual',
      sourceUrl: website,
      raw: manual.raw ?? {},
      priority: priority++,
    });
  }

  return discovered.sort((a, b) => {
    const pa = SOURCE_PRIORITY.indexOf(a.sourceType);
    const pb = SOURCE_PRIORITY.indexOf(b.sourceType);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.priority - b.priority;
  });
}

function parseBusinessCardText(text) {
  const raw = String(text ?? '');
  const phone = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? null;
  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim() ?? null;
  const website = raw.match(/https?:\/\/[^\s]+/i)?.[0]?.trim() ?? null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const name = lines[0] ?? null;
  return { name, businessName: name, phone, email, website, ocrText: raw };
}

function defaultLog(msg, meta) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(msg, meta ?? '');
  }
}
