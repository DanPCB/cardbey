# Impact Report — Multi-market discovery provider geo + category tags

## What could break
- Melbourne real-local / Batch001 discovery results (Google location string, OSM tags)
- Google Places query shape / candidate `country`/`state` fields
- OSM Overpass bbox / Nominatim geocode for multi-market jobs
- Discovery provider cache hits (key shape)

## Why
Multi-market already passed `countryCode` / `categorySearchTerms`, but `DiscoveryProviderManager` ignored them. Google Places hardcodes `VIC Australia`; OSM uses pilot `osmTagsForPilotCategories` (e.g. Hotel → `amenity=Hotel` instead of `tourism=hotel`). VN hotel jobs finish “success” with zero candidates.

## Impact scope
- `DiscoveryBatchParams` + `DiscoveryProviderManager`
- `GooglePlacesDiscoveryProvider`, `OsmDiscoveryProvider` (geocode/bbox)
- `multiMarketDiscoveryService` (pass registry osmTags + territory/parent bbox)
- QA Review metrics improve only after **new** fetches (old zero jobs unchanged)

## Smallest safe patch
1. Optional market fields on `DiscoveryBatchParams` (default unset → Melbourne pilot unchanged)
2. Country-aware Google location bias; stamp candidate country/state from market
3. Prefer registry `osmTags` + registry/parent `bbox`; Nominatim `countrycodes` when geocoding
4. Include country/tags in OSM cache key when market context present
