# IMPACT — For You: creator-first paint + scroll-anchor trap

**Date:** 2026-09-03  
**Issue:** Republished stores (e.g. AWE FINANCIAL) rank #1 in `/api/public/stores/feed` and are first in the DOM, but the live centre stage shows **Creator Studio in 5 minutes**. Discover “Recently Joined” still shows the store.

## Root cause

1. Creator feed often resolves **before** the store feed.
2. `usePreparedPublicFeedArtifacts` blended creators while store pages were still empty → first paint was creator-only at `scrollTop = 0`.
3. When stores arrived, ranking correctly put AWE at index 0, but the browser **scroll-anchored** on the already-visible Creator Studio card and increased `scrollTop` as the list grew — stage stayed on Creator Studio.

Hero republish / `publishedAt` bump was already working; this is a frontend race, not a missing rank bump.

## What could break

- Brief skeleton instead of an early creator card while stores load (intended).
- If the store feed fails empty, creators still blend after settle (fallback unchanged).
- Intentional feed memory restore (`initialFeedIndex` / `scrollY`) unchanged.

## Impact scope

Homepage For You blended feed only (`usePreparedPublicFeedArtifacts` + defensive scroll reset in `ArtifactFeed`).

## Smallest safe patch

1. Do not blend creator/discovery extras until the store feed has settled (or already has store artifacts).
2. If the leading artifact id changes and there is no restore memory, reset feed `scrollTop` to 0.
