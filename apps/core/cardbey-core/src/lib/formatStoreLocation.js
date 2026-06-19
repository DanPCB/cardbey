/**
 * Canonical store location display — single source of truth for feed, public store, and projections.
 * Never invents a city; returns null when no address signal exists on the record.
 */

export const LOCATION_NOT_CONFIRMED_LABEL = 'Location not confirmed';
export const LOCATION_UNAVAILABLE_LABEL = 'Location unavailable';

const RELIABLE_CONFIDENCE = new Set(['high', 'medium', 'street_level', 'confirmed', 'city_level']);

function trim(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasCoordinates(store) {
  return Number.isFinite(store?.lat) && Number.isFinite(store?.lng);
}

/**
 * Whether the store has coordinates suitable for map display.
 * @param {object | null | undefined} store
 */
export function hasConfirmedStoreCoordinates(store) {
  if (!hasCoordinates(store)) return false;
  const confidence = trim(store?.locationConfidence)?.toLowerCase();
  if (!confidence) return true;
  if (confidence === 'low' || confidence === 'unconfirmed') return false;
  return true;
}

/**
 * Whether feed/public cards can show suburb/city text confidently.
 * @param {object | null | undefined} store
 */
export function hasReliableStoreLocationLabel(store) {
  if (hasConfirmedStoreCoordinates(store)) return true;
  const confidence = trim(store?.locationConfidence)?.toLowerCase();
  if (confidence && RELIABLE_CONFIDENCE.has(confidence)) {
    return hasCanonicalStoreAddress(store);
  }
  if (hasCoordinates(store)) return true;
  if (confidence === 'city_level' && (trim(store?.city) || trim(store?.suburb))) return true;
  return false;
}

/**
 * Feed/card location line with confidence-aware fallback text.
 * @param {object | null | undefined} store
 * @returns {string | null}
 */
export function formatFeedStoreLocationLabel(store) {
  if (!store || typeof store !== 'object') return null;

  const compact = formatStoreLocation(store);
  if (compact && hasReliableStoreLocationLabel(store)) return compact;

  if (hasCanonicalStoreAddress(store) && !hasConfirmedStoreCoordinates(store)) {
    return LOCATION_NOT_CONFIRMED_LABEL;
  }

  if (!hasCanonicalStoreAddress(store)) {
    return null;
  }

  return LOCATION_NOT_CONFIRMED_LABEL;
}

/**
 * Public display address — prefers formattedAddress when present.
 * @param {object | null | undefined} store
 */
export function formatStoreFormattedAddress(store) {
  const formatted = trim(store?.formattedAddress);
  if (formatted) return formatted;
  return formatStoreLocationLong(store);
}

/**
 * @param {string | null | undefined} address
 * @returns {string | null}
 */
export function extractLocalityFromAddress(address) {
  const line = trim(address);
  if (!line) return null;
  const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0].replace(/\b\d{4,5}\b/g, '').trim();
  return first || null;
}

/**
 * @param {object | null | undefined} store
 * @returns {boolean}
 */
export function hasCanonicalStoreAddress(store) {
  if (!store || typeof store !== 'object') return false;
  return Boolean(
    trim(store.address ?? store.addressLine) ||
      trim(store.suburb) ||
      trim(store.city) ||
      trim(store.state) ||
      trim(store.postcode) ||
      trim(store.country) ||
      (Number.isFinite(store.lat) && Number.isFinite(store.lng)),
  );
}

/**
 * Compact label for feed cards and headers (suburb or city — never fabricated).
 * @param {object | null | undefined} store
 * @returns {string | null}
 */
export function formatStoreLocation(store) {
  if (!hasCanonicalStoreAddress(store)) return null;

  const suburb = trim(store.suburb);
  const city = trim(store.city);
  const state = trim(store.state);
  const address = trim(store.address ?? store.addressLine);

  const locality = suburb || city || extractLocalityFromAddress(address);
  if (!locality) {
    const stateOnly = trim(store.state);
    if (stateOnly) return stateOnly;
    const countryOnly = trim(store.country);
    return countryOnly || null;
  }

  if (state && state.length <= 4 && !locality.toLowerCase().includes(state.toLowerCase())) {
    return `${locality}, ${state}`;
  }

  return locality;
}

/**
 * Longer label for store profile (locality + state + country when present).
 * @param {object | null | undefined} store
 * @returns {string | null}
 */
export function formatStoreLocationLong(store) {
  if (!hasCanonicalStoreAddress(store)) return null;

  const parts = [];
  const compact = formatStoreLocation(store);
  if (compact) parts.push(compact);

  const state = trim(store.state);
  const country = trim(store.country);
  if (state && compact && !compact.includes(state)) {
    parts.push(state);
  } else if (state && !compact) {
    parts.push(state);
  }
  if (country && !parts.some((p) => p.toLowerCase().includes(country.toLowerCase()))) {
    parts.push(country);
  }

  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length ? unique.join(', ') : null;
}

/**
 * Normalized address fields for publish projections and public DTOs.
 * @param {object | null | undefined} business
 */
export function buildStoreLocationFields(business) {
  let styleLocationMeta = {};
  if (business?.stylePreferences) {
    try {
      const prefs =
        typeof business.stylePreferences === 'string'
          ? JSON.parse(business.stylePreferences)
          : business.stylePreferences;
      if (prefs?.locationMeta && typeof prefs.locationMeta === 'object') {
        styleLocationMeta = prefs.locationMeta;
      }
    } catch {
      /* ignore */
    }
  }

  const merged = { ...styleLocationMeta, ...(business ?? {}) };
  const address = trim(merged.address ?? merged.addressLine);
  const addressLine2 = trim(merged.addressLine2);
  const suburb = trim(merged.suburb);
  const city = trim(merged.city);
  const state = trim(merged.state);
  const postcode = trim(merged.postcode);
  const country = trim(merged.country);
  const formattedAddress = trim(merged.formattedAddress);
  const locationSource = trim(merged.locationSource);
  const locationConfidence = trim(merged.locationConfidence);
  const osmPlaceId = trim(merged.osmPlaceId);
  const lat = Number.isFinite(merged.lat) ? merged.lat : null;
  const lng = Number.isFinite(merged.lng) ? merged.lng : null;

  const storeShape = {
    address,
    addressLine2,
    suburb,
    city,
    state,
    postcode,
    country,
    formattedAddress,
    locationSource,
    locationConfidence,
    osmPlaceId,
    lat,
    lng,
  };

  return {
    address,
    addressLine2,
    suburb,
    city,
    state,
    postcode,
    country,
    formattedAddress,
    locationSource,
    locationConfidence,
    osmPlaceId,
    lat,
    lng,
    locationLabel: formatFeedStoreLocationLabel(storeShape),
    formattedAddressDisplay: formatStoreFormattedAddress(storeShape),
    hasConfirmedCoordinates: hasConfirmedStoreCoordinates(storeShape),
    hasReliableLocation: hasReliableStoreLocationLabel(storeShape),
  };
}
