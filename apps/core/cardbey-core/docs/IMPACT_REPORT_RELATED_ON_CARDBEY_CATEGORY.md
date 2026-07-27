# Impact Report: Related on Cardbey category relevance

**Date:** 2026-07-28  
**Live evidence:** Hot Chicken storefront (`/s/hot-chicken?from=feed`) shows Promax Barber and Pink Lotus Thai Massage under “Related on Cardbey.”

## What could break

1. Related rail becomes empty when snapshot is cross-vertical and Core API is slow/unavailable.
2. Explore section traffic drops if unrelated cards are no longer labelled “Related.”
3. Cache key change may briefly recompute rankings (desired).

## Why

Related rail was **frontend-only**: `pickRelatedArtifacts` soft-scored a **feed sessionStorage snapshot** using the **feed tab** (`all` / `for_you`), not the current store’s business category. No hard vertical filter → barber/massage rank nearly as high as food (`/s/` + media bonuses). DEV mock pad could inject services without scoring.

## Impact scope

- Core: new taxonomy + ranker + `GET /api/public/stores/:slug/related` (+ tests/docs).
- Dashboard: related ranking uses store category; Related vs Explore separation; snapshot cache keys; tests.
- No publish/billing/signage paths.

## Smallest safe patch

1. Canonical `businessCategory` taxonomy + legacy label normalisation (no loose UI-label equality).
2. Deterministic score with incompatible category −100; never admit incompatible while same-category inventory exists.
3. Core related endpoint as source of truth; client ranking for snapshot as aligned fallback.
4. “Related on Cardbey” = related only; general discovery stays under “Explore more from Cardbey.”
5. Fewer cards rather than irrelevant filler.

## No-parallel-stack proof

Single related ranker module + one public endpoint; does not add a second recommendation product or parallel feed.
