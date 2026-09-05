# Impact Report — Discover claim badge false Unclaimed

## What could break
- Discover card Claim CTAs / Unclaimed filter counts

## Why
Published feed DTOs often omit `isClaimed` and leave `claimStatus` null for owner stores. Client defaulted missing status to `unclaimed`.

## Impact scope
- `publishedBusinessArtifactToPublicStore.js` (emit `isClaimed`)
- `useDiscoverStores.ts` (resolve claim using provenance + feed default)

## Smallest safe patch
Mirror `isPublicStoreClaimed`: owner + null claimStatus → claimed; only show Unclaimed for explicit unclaimed / discovery seeds.
