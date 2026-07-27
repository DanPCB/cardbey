# Impact Report: Storefront catalog List/Grid default on publish

## Goal

Let owners publish (or update) a store with **List** or **Grid** as the catalog default. Today Core already stores `storefrontSettings.defaultView`, but `/s/:slug` (WebsitePreviewPage `CatalogSection`) hardcodes `grid`, so List never appears as the live default — bad when service cards use mismatched demo images.

## What could break

1. **Public catalog always opens in Grid** — already broken for stores that set List; visitors never see the intended layout.
2. **Toggle visibility** — if `allowUserToggle: false` is ignored, visitors can still switch views (minor; current code always shows toggle).
3. **Owner “set default” on wrong store id** — only wire `updateStore` when `isPublishedStoreOwner` and a real store id exist.

## Why

- Persist/publish path already merges `defaultView` / `allowUserToggle` (`publishDraftService.js`, `stores.js` PATCH, `publicStoreMapper.js`).
- `StorePreviewPage` already loads and saves default view.
- `WebsitePreviewPage` `CatalogSection` uses `useState('grid')` and never reads `storefrontSettings`.
- `publicStoreToMiniWebsitePreview` drops `storefrontSettings`, so even when the public API returns it, preview state loses it.

## Impact scope

- Public mini website: `/s/:slug` → `WebsitePreviewPage` → `CatalogSection`
- Owner edit website on published store (same page): Grid/List toggle + “Set as storefront default”
- Mapper: `publicMiniWebsiteMapper.ts`
- No Core schema change; no new `catalogLayout` field (reuse `defaultView`)

## Smallest safe patch

1. Pass through `storefrontSettings` on `PublicStoreForMiniWebsite` / mini-website preview.
2. Init `CatalogSection` from `defaultView`; respect `allowUserToggle`.
3. Owner-only “Set as storefront default” → existing `updateStore({ storefrontSettings: { defaultView } })`.

## No-parallel-stack proof

Does not add a second layout setting, Intent Runtime surface, or alternate publish contract. Reuses `Business.storefrontSettings.defaultView` only.
