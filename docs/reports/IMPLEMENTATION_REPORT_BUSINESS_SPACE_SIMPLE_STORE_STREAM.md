# BUSINESS SPACE — SIMPLE STORE STREAM CONVERGENCE

**Date:** 2026-09-05  
**Mission:** `BUSINESS_SPACE_SIMPLE_STORE_STREAM`  
**Related:** `docs/BUSINESS_SPACE_FULL_STORE_CONVERGENCE_V1.md`

## What shipped

| Change | Behavior |
|--------|----------|
| `ownBusinessContentComplete` | Long-tail waits until Content includes the native commerce grid when offerings exist |
| `BusinessSpaceStoreCommerceSection` | GRID of Store SSOT offerings + category chips + item CTAs |
| Content tab (with offerings) | Activity/Shows → **Menu/Catalog GRID** → Partner/Related long-tail |
| Categories (left rail) | Filter/focus in-space commerce; stay on Content; scroll to grid |
| Services tab | Same commerce grid (shortcut) |
| View Full Website | `/s/:slug?from=space&spaceId=…` optional escape |
| Offering fill in media stream | Removed (`BUSINESS_STREAM_MAX_OFFERING_FILL = 0`) |

## Intentionally not built

- No `BusinessSpaceCatalog` domain
- No iframe of `/s/:slug`
- No duplicate product/service SSOT
- No new top-level store navigation product

## Tests

- `ownBusinessContentComplete.test.ts` — pass
- `composeBusinessSpaceStream.test.ts` — long-tail gate — pass
- `composeBusinessSpaceContentStream.test.ts` — no offering fill — pass

## Verdict

**Code path:** `BUSINESS_SPACE_SIMPLE_STORE_STREAM_READY`

`/space/:storeId` projects full Store SSOT commerce in Content; `/s/:slug` is optional via View Full Website.

**Browser proof:** French Baguette Cafe end-to-end on Global → Space not re-verified in this pass — confirm locally before release sign-off.
