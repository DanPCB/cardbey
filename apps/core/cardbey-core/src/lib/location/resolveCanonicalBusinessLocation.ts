/**
 * Canonical business location resolver — single source of truth for store generation.
 * Priority: user input → seed → import → geocode → unavailable.
 * Never assigns demo fallback cities (Austin, Singapore, rotating mock labels).
 */

import { formatStoreLocation } from '../formatStoreLocation.js';

export type CanonicalLocationSource =
  | 'user_prompt'
  | 'user_intake'
  | 'seed_verified'
  | 'imported_business'
  | 'geocoded'
  | 'draft_store'
  | 'store_fields'
  | 'bi_snapshot'
  | 'mission_context'
  | 'unavailable';

export type CanonicalBusinessLocation = {
  displayLocation: string;
  city: string | null;
  suburb: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  source: CanonicalLocationSource;
  confidence: number;
};

export type ResolveCanonicalBusinessLocationInput = {
  userPrompt?: string | null;
  locationText?: string | null;
  address?: string | null;
  suburb?: string | null;
  city?: string | null;
  region?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  countryCode?: string | null;
  operatingRegion?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  seed?: {
    address?: string | null;
    suburb?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    operatingRegion?: string | null;
  } | null;
  draftStore?: {
    address?: string | null;
    suburb?: string | null;
    state?: string | null;
    country?: string | null;
    location?: string | null;
  } | null;
  store?: {
    address?: string | null;
    suburb?: string | null;
    state?: string | null;
    country?: string | null;
    region?: string | null;
  } | null;
  biSnapshot?: {
    address?: string | null;
    city?: string | null;
    suburb?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
  missionContext?: {
    canonicalLocation?: CanonicalBusinessLocation | null;
    location?: string | null;
  } | null;
  geocoded?: {
    suburb?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    addressLine?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};

const AU_STATES = new Set(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']);

/** Suburbs that imply VIC when no state is present. */
const AU_VIC_LOCALITIES = new Set(
  [
    'carlton',
    'fitzroy',
    'brunswick',
    'collingwood',
    'richmond',
    'south yarra',
    'st kilda',
    'prahran',
    'footscray',
    'braybrook',
    'docklands',
    'cbd',
  ].map((s) => s.toLowerCase()),
);

/** Never use as synthetic defaults (user/import/seed may still supply these explicitly). */
export const DEMO_FALLBACK_LOCATION_NAMES = new Set(
  ['austin', 'singapore', 'ho chi minh city', 'hcm'].map((s) => s.toLowerCase()),
);

export const LOCATION_UNAVAILABLE_LABEL = 'Location unavailable';

function trim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeStateToken(raw: string | null): string | null {
  const s = trim(raw);
  if (!s) return null;
  const upper = s.replace(/\s+\d{4,5}\s*$/, '').trim().toUpperCase();
  if (AU_STATES.has(upper)) return upper;
  const auRegion = /^AU[-_]?([A-Z]{2,3})$/i.exec(upper);
  if (auRegion) return auRegion[1].toUpperCase();
  if (upper.length <= 4 && /^[A-Z]+$/.test(upper)) return upper;
  return s;
}

function normalizeCountry(raw: string | null, state: string | null): { country: string | null; countryCode: string | null } {
  const s = trim(raw);
  if (!s) {
    if (state && AU_STATES.has(state)) return { country: 'Australia', countryCode: 'AU' };
    return { country: null, countryCode: null };
  }
  const lower = s.toLowerCase();
  if (lower === 'au' || lower === 'australia') return { country: 'Australia', countryCode: 'AU' };
  if (lower === 'sg' || lower === 'sgp' || lower === 'singapore') return { country: 'Singapore', countryCode: 'SG' };
  if (lower === 'us' || lower === 'usa' || lower.includes('united states')) return { country: 'United States', countryCode: 'US' };
  if (lower === 'nz' || lower.includes('new zealand')) return { country: 'New Zealand', countryCode: 'NZ' };
  if (lower === 'vn' || lower.includes('vietnam')) return { country: 'Vietnam', countryCode: 'VN' };
  return { country: s, countryCode: null };
}

function shouldRejectSyntheticDemoLocation(
  locationText: string | null,
  hasUserPrompt: boolean,
): boolean {
  if (hasUserPrompt) return false;
  const t = trim(locationText)?.toLowerCase();
  if (!t) return false;
  return DEMO_FALLBACK_LOCATION_NAMES.has(t);
}

function extractLocationFromPrompt(prompt: string | null): string | null {
  const text = trim(prompt);
  if (!text) return null;
  const inMatch =
    /\b(?:in|at|near)\s+([A-Za-z][A-Za-z\s,'-]+?)(?:\s*[,.]|$|\s+(?:vic|nsw|qld|sa|wa|tas|nt|act|australia|au)\b)/i.exec(
      text,
    ) ??
    /\b(?:in|at|near)\s+([A-Za-z][A-Za-z\s,'-]+)\b/i.exec(text);
  if (inMatch?.[1]) return trim(inMatch[1]);
  const cityMatch = text.match(
    /\b(Melbourne|Sydney|Brisbane|Perth|Adelaide|Canberra|Carlton|Fitzroy|Brunswick|Singapore|Austin)\b/i,
  );
  return cityMatch ? trim(cityMatch[1]) : null;
}

function parseAddressLine(address: string | null): {
  addressLine: string | null;
  suburb: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  countryCode: string | null;
} {
  const line = trim(address);
  if (!line) {
    return {
      addressLine: null,
      suburb: null,
      city: null,
      region: null,
      postcode: null,
      country: null,
      countryCode: null,
    };
  }

  const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
  let suburb: string | null = null;
  let city: string | null = null;
  let region: string | null = null;
  let postcode: string | null = null;
  let country: string | null = null;
  let countryCode: string | null = null;

  if (parts.length >= 4) {
    suburb = parts[parts.length - 3] ?? null;
    const statePart = parts[parts.length - 2] ?? '';
    region = normalizeStateToken(statePart);
    const pc = /\b(\d{4,5})\b/.exec(statePart);
    postcode = pc?.[1] ?? null;
    const countryNorm = normalizeCountry(parts[parts.length - 1] ?? null, region);
    country = countryNorm.country;
    countryCode = countryNorm.countryCode;
    city = suburb;
  } else if (parts.length === 3) {
    suburb = parts[0];
    region = normalizeStateToken(parts[1]);
    const countryNorm = normalizeCountry(parts[2], region);
    country = countryNorm.country;
    countryCode = countryNorm.countryCode;
    city = suburb;
  } else if (parts.length === 2) {
    city = parts[0];
    const countryNorm = normalizeCountry(parts[1], null);
    country = countryNorm.country;
    countryCode = countryNorm.countryCode;
  } else {
    city = parts[0] ?? null;
  }

  if (!region && suburb && AU_VIC_LOCALITIES.has(suburb.toLowerCase())) {
    region = 'VIC';
    const countryNorm = normalizeCountry(country, region);
    country = country ?? countryNorm.country;
    countryCode = countryCode ?? countryNorm.countryCode;
  }

  if (city?.toLowerCase() === 'melbourne' && suburb && suburb.toLowerCase() !== 'melbourne') {
    // Keep suburb as primary locality; city remains Melbourne for display when needed.
  }

  return { addressLine: line, suburb, city, region, postcode, country, countryCode };
}

function buildFromParts(
  parts: {
    addressLine?: string | null;
    suburb?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    countryCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  source: CanonicalLocationSource,
  confidence: number,
): CanonicalBusinessLocation | null {
  const suburb = trim(parts.suburb);
  const city = trim(parts.city);
  const region = normalizeStateToken(trim(parts.region));
  const addressLine = trim(parts.addressLine);
  const countryNorm = normalizeCountry(trim(parts.country), region);
  const country = countryNorm.country;
  const countryCode = trim(parts.countryCode) ?? countryNorm.countryCode;

  if (!addressLine && !suburb && !city && !region && !country) return null;

  const displayLocation =
    formatStoreLocation({
      address: addressLine,
      suburb,
      city,
      state: region,
      country,
    }) ?? trim([suburb ?? city, region].filter(Boolean).join(', ')) ?? country ?? null;

  if (!displayLocation) return null;

  return {
    displayLocation,
    city,
    suburb,
    region,
    country,
    countryCode,
    addressLine,
    latitude: Number.isFinite(parts.latitude) ? (parts.latitude as number) : null,
    longitude: Number.isFinite(parts.longitude) ? (parts.longitude as number) : null,
    source,
    confidence: clampConfidence(confidence),
  };
}

function unavailable(): CanonicalBusinessLocation {
  return {
    displayLocation: LOCATION_UNAVAILABLE_LABEL,
    city: null,
    suburb: null,
    region: null,
    country: null,
    countryCode: null,
    addressLine: null,
    latitude: null,
    longitude: null,
    source: 'unavailable',
    confidence: 0,
  };
}

/**
 * Resolve canonical business location from all available inputs (priority ordered).
 */
export function resolveCanonicalBusinessLocation(
  input: ResolveCanonicalBusinessLocationInput = {},
): CanonicalBusinessLocation {
  const missionCanonical = input.missionContext?.canonicalLocation;
  if (missionCanonical && typeof missionCanonical === 'object' && missionCanonical.displayLocation) {
    return { ...missionCanonical, source: 'mission_context', confidence: Math.max(missionCanonical.confidence ?? 0.95, 0.95) };
  }

  const userLocationText =
    trim(input.locationText) ??
    trim(input.missionContext?.location) ??
    extractLocationFromPrompt(trim(input.userPrompt));

  const userAddress = trim(input.address);
  if (userAddress) {
    const parsed = parseAddressLine(userAddress);
    const built = buildFromParts(
      {
        ...parsed,
        suburb: trim(input.suburb) ?? parsed.suburb,
        city: trim(input.city) ?? parsed.city,
        region: normalizeStateToken(trim(input.state) ?? trim(input.region)) ?? parsed.region,
        country: trim(input.country) ?? parsed.country,
        countryCode: trim(input.countryCode) ?? parsed.countryCode,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      trim(input.userPrompt) ? 'user_prompt' : 'user_intake',
      0.95,
    );
    if (built) return built;
  }

  if (userLocationText && !shouldRejectSyntheticDemoLocation(userLocationText, Boolean(trim(input.userPrompt)))) {
    const parsed = parseAddressLine(userLocationText);
    const locality = trim(userLocationText.split(',')[0]);
    const built = buildFromParts(
      {
        addressLine: null,
        suburb: trim(input.suburb) ?? parsed.suburb ?? (locality && AU_VIC_LOCALITIES.has(locality.toLowerCase()) ? locality : null),
        city: trim(input.city) ?? parsed.city ?? locality,
        region:
          normalizeStateToken(trim(input.state) ?? trim(input.region) ?? trim(input.operatingRegion)) ??
          parsed.region ??
          (locality && AU_VIC_LOCALITIES.has(locality.toLowerCase()) ? 'VIC' : null) ??
          (locality?.toLowerCase() === 'melbourne' ? 'VIC' : null) ??
          (locality?.toLowerCase() === 'singapore' ? null : null),
        country:
          trim(input.country) ??
          parsed.country ??
          (locality?.toLowerCase() === 'melbourne' || (locality && AU_VIC_LOCALITIES.has(locality.toLowerCase()))
            ? 'Australia'
            : locality?.toLowerCase() === 'singapore'
              ? 'Singapore'
              : null),
        countryCode:
          trim(input.countryCode) ??
          parsed.countryCode ??
          (locality?.toLowerCase() === 'singapore' ? 'SG' : locality?.toLowerCase() === 'melbourne' ? 'AU' : parsed.countryCode),
        latitude: input.latitude,
        longitude: input.longitude,
      },
      trim(input.userPrompt) ? 'user_prompt' : 'user_intake',
      0.9,
    );
    if (built) return built;
  }

  const seed = input.seed;
  if (seed?.address || seed?.city || seed?.suburb) {
    const parsed = parseAddressLine(trim(seed.address));
    const built = buildFromParts(
      {
        addressLine: trim(seed.address) ?? parsed.addressLine,
        suburb: trim(seed.suburb) ?? parsed.suburb,
        city: trim(seed.city) ?? parsed.city,
        region:
          normalizeStateToken(trim(seed.state) ?? trim(seed.operatingRegion)) ?? parsed.region,
        country: trim(seed.country) ?? parsed.country,
        countryCode: parsed.countryCode,
      },
      'seed_verified',
      0.88,
    );
    if (built) return built;
  }

  const bi = input.biSnapshot;
  if (bi && (bi.address || bi.city || bi.suburb)) {
    const parsed = parseAddressLine(trim(bi.address));
    const built = buildFromParts(
      {
        addressLine: trim(bi.address) ?? parsed.addressLine,
        suburb: trim(bi.suburb) ?? parsed.suburb,
        city: trim(bi.city) ?? parsed.city,
        region: normalizeStateToken(trim(bi.region)) ?? parsed.region,
        country: trim(bi.country) ?? parsed.country,
        countryCode: parsed.countryCode,
      },
      'bi_snapshot',
      0.82,
    );
    if (built) return built;
  }

  const imported = input.draftStore ?? input.store;
  if (imported && (imported.address || imported.suburb || imported.location)) {
    const parsed = parseAddressLine(trim(imported.address ?? imported.location));
    const built = buildFromParts(
      {
        addressLine: trim(imported.address) ?? parsed.addressLine,
        suburb: trim(imported.suburb) ?? parsed.suburb,
        city: parsed.city,
        region: normalizeStateToken(trim(imported.state)) ?? parsed.region,
        country: trim(imported.country) ?? parsed.country,
        countryCode: parsed.countryCode,
      },
      input.draftStore ? 'draft_store' : 'store_fields',
      0.78,
    );
    if (built) return built;
  }

  const geo = input.geocoded;
  if (geo && (geo.addressLine || geo.city || geo.suburb)) {
    const built = buildFromParts(
      {
        addressLine: trim(geo.addressLine),
        suburb: trim(geo.suburb),
        city: trim(geo.city),
        region: normalizeStateToken(trim(geo.region)),
        country: trim(geo.country),
        latitude: geo.latitude,
        longitude: geo.longitude,
      },
      'geocoded',
      0.75,
    );
    if (built) return built;
  }

  return unavailable();
}

/** Canonical location from ingested seed normalized record (discovery, profile, activation). */
export function resolveCanonicalLocationFromSeedNormalized(n: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  operatingRegion?: string | null;
}): CanonicalBusinessLocation {
  return resolveCanonicalBusinessLocation({
    seed: {
      address: n.address ?? null,
      city: n.city ?? null,
      state: n.state ?? null,
      country: n.country ?? null,
      operatingRegion: n.operatingRegion ?? null,
    },
    address: n.address ?? null,
    city: n.city ?? null,
    state: n.state ?? null,
    country: n.country ?? null,
    operatingRegion: n.operatingRegion ?? null,
  });
}

export function logLocationCanonicalized(payload: Record<string, unknown>): void {
  console.log('[LOCATION_CANONICALIZED]', JSON.stringify(payload));
}

export function logLocationGenerationMismatch(payload: Record<string, unknown>): void {
  console.warn('[LOCATION_GENERATION_MISMATCH]', JSON.stringify(payload));
}

export function logLocationRepairCandidate(payload: Record<string, unknown>): void {
  console.log('[LOCATION_REPAIR_CANDIDATE]', JSON.stringify(payload));
}
