# Impact report: feed shows “Location not confirmed” despite city/address

## Observed

Feed identity under the store name shows **Location not confirmed** even when create-store supplies a city (e.g. Melbourne).

## Why (sourced)

In `formatStoreLocation.js`, `formatFeedStoreLocationLabel` only returned the compact city/suburb label when `hasReliableStoreLocationLabel` was true. City/suburb with `locationConfidence: 'unconfirmed'` (common before geocode) failed that gate and returned `LOCATION_NOT_CONFIRMED_LABEL`.

Additionally `publicStoreMapper.js` set `city: locationLabel`, so the public DTO’s `city` field was poisoned with the placeholder string.

## What could break

| Risk | Scope |
|------|--------|
| Stores previously labeled “Location not confirmed” now show city/suburb text | Public feed + public store DTOs |
| Map pin still gated by `hasConfirmedCoordinates` | Unchanged — display **text** only |

## Smallest safe patch

1. Prefer `formatStoreLocation` / long address text whenever present.
2. Map `city` from `locationFields.city`, not from `locationLabel`.
3. Dashboard: treat placeholder labels as empty; do not render them as city.
