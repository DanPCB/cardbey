/**
 * TypeScript facade — canonical runtime is businessDiscoverySources.js
 */

import type { DiscoverySource, SourceAttribution } from './businessDiscoveryTypes.js';

export {
  getGooglePlacesApiMode,
  getGooglePlacesApiStatus,
  isGooglePlacesConfigured,
  searchGooglePlaces,
  fetchGooglePlaceDetails,
  extractFromWebsite,
  fromManualInput,
} from './businessDiscoverySources.js';

export interface RawDiscoveryResult {
  raw: Record<string, unknown>;
  source: DiscoverySource;
  attribution: SourceAttribution;
}

export type { DiscoverySource, SourceAttribution };
