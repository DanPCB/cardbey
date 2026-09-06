# Impact Report — Business contact on Space identity (not /s/:slug)

## Status
Implemented (dashboard): Discover → `/space/:id`; contact band under avatar + avatar popup.

## What could break
- Discover card destinations (recently `/s/:slug`)
- Feed identity strip density under hero
- Expanded avatar popup layout
- Commerce flows that correctly still use `/s/:slug` for book/order

## Why
- Product intent: business presence is Universal Profile / Space (`/space/:id`), not commerce mini-site
- Fetched phone/address/hours should sit under avatar + avatar popup (green CTA band area)
- `/s/:slug` remains commerce resource UI only

## Impact scope
- Discover open href → `/space/:storeId` for published store cards
- `BusinessIdentityCard` contact band + `ExpandedProfileCard` contact lines
- Feed projection: pass `hours` / `formattedAddress` onto artifacts when available
- Does **not** remove `/s/:slug` routes or StoreInfoPanel (commerce / direct links)

## Smallest safe patch
1. `resolveDiscoverOpenHref` → Space for `source==='store'`
2. Shared `BusinessIdentityContact` under identity + in expanded popup
3. Map hours from tradingHours/hours into feed artifact when present
