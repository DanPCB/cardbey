# Impact Report — Universal Library video playback

**Date:** 2026-08-08  
**Scope:** In-app play for public `/library` video assets (Pexels REFERENCE first).

## What could break

1. **Public catalogue payload shape** — new optional `streamUrl` / `canonicalUrl` on public asset views; clients that ignore unknown fields are fine; strict schema validators could fail.
2. **Playback / CORS** — browser `<video src={pexels CDN}>` may fail on some CDNs; UI must fall back to still + “Open on Pexels”.
3. **Rights leakage** — must not dump raw `metadata` or rights evidence; only a single cleared stream URL + public page URL.

## Why

Videos appeared as still thumbnails with a decorative Play badge. Core stored the file in `metadata.videoUrl` but `toPublicAssetView` stripped it; Dashboard detail sheet never mounted `<video>`.

## Impact scope

- Core: `publicAssetView.js` (+ small unit coverage if present)
- Dashboard: `UniversalAsset` contract, `ResourceCard` / `ResourceDetailSheet` mapping + player
- Staging then main (focused PRs)

## Smallest safe patch

1. Core: for `type=video`, expose `streamUrl` from `metadata.videoUrl` (https only) and `canonicalUrl` from `sourceUrl` (https page).
2. Dashboard: map `streamUrl`; detail sheet renders `<video controls poster=…>` when present; keep Preview source link.
3. No fixture enablement; no bulk re-ingest required (existing Pexels rows already have `metadata.videoUrl`).

## No-parallel-stack proof

Same Universal Library Core API + Dashboard Library page; no new media product or alternate catalogue.
