/**
 * Canonical store location display — single source of truth for feed, public store, and projections.
 * Never invents a city; returns null when no address signal exists on the record.
 */

function trim(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
  const address = trim(business?.address ?? business?.addressLine);
  const suburb = trim(business?.suburb);
  const city = trim(business?.city);
  const state = trim(business?.state);
  const postcode = trim(business?.postcode);
  const country = trim(business?.country);
  const lat = Number.isFinite(business?.lat) ? business.lat : null;
  const lng = Number.isFinite(business?.lng) ? business.lng : null;

  return {
    address,
    suburb,
    city,
    state,
    postcode,
    country,
    lat,
    lng,
    locationLabel: formatStoreLocation({
      address,
      suburb,
      city,
      state,
      postcode,
      country,
      lat,
      lng,
    }),
  };
}
