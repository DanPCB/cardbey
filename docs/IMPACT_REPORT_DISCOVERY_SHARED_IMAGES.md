# Impact Report — Discovery shared representative images

## What could break
- Pexels/stock hero selection for pubs/hotels/inns
- Media discovery “provider_photo” evidence rows
- Category representative URLs for lodging

## Why
1. `inferHeroSubCategory` matches `hotel` as **pub** before hotel → shared Pexels bar photo
2. `buildProviderPhotoAsset` uses Maps **place** URI as an image URL (not a photo)
3. Places search field mask omits `places.photos`
4. Hotels fall through to shared `unknown` Unsplash when category stock has no hotel key

## Impact scope
- `heroSearchQueries.ts`, `mediaDiscoveryAgent.ts`, `categoryMediaVocabulary.ts`
- `businessDiscoverySources.runtime.js` (+ `.ts` if present) photo field mapping

## Smallest safe patch
1. Match lodging/hotel/motel **before** pub/bar tokens; remove bare `hotel` from pub list
2. Provider photo asset only from photo_reference / Places photo `name` — never `sourceUrl`
3. Add `hotel` pilot category stock URL
4. Request and map `places.photos` into `rawSourceJson` for later CDN/proxy (no public API-key img URLs)
