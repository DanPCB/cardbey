/**
 * TypeScript facade — canonical runtime is businessDiscoverySources.runtime.js
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
} from './businessDiscoverySources.runtime.js';

export interface RawDiscoveryResult {
  raw: Record<string, unknown>;
  source: DiscoverySource;
  attribution: SourceAttribution;
}

export type { DiscoverySource, SourceAttribution };
