# IMPACT — Front-screen For You: restore store primacy over creator/Others

**Date:** 2026-09-03  
**Issue:** Live `cardbey.com` For You centre stage dominated by Creator01 promo video; republished stores visible in Discover but not first on stage.

## Root cause

`injectOthersRhythmInForYou` initialized `sinceOthers = OTHERS_INJECT_INTERVAL`, so the first Others/creator card was forced into **slot 0**. Creators were also prepended before stores in `usePreparedPublicFeedArtifacts`.

## Smallest safe patch

1. Initialize `sinceOthers = 0` → commerce leads; Others inject after ~5 stores.  
2. Append creator artifacts after merged stores (`[...merged, ...creatorArtifacts]`).  
3. Unit test: first For You card is store when both exist.

## What could break

- Creator promo no longer first on For You (intended).  
- Creators page / Others lane / Explore featured videos unchanged.  
- Density cap (max 1 Others per 5 commerce) unchanged.

## Impact scope

Homepage For You mixed feed order only.
