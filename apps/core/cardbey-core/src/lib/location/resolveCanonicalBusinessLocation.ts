/**
 * TypeScript facade — canonical runtime is resolveCanonicalBusinessLocation.runtime.js
 */

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

export {
  DEMO_FALLBACK_LOCATION_NAMES,
  LOCATION_UNAVAILABLE_LABEL,
  resolveCanonicalBusinessLocation,
  resolveCanonicalLocationFromSeedNormalized,
  logLocationCanonicalized,
  logLocationGenerationMismatch,
  logLocationRepairCandidate,
} from './resolveCanonicalBusinessLocation.runtime.js';
