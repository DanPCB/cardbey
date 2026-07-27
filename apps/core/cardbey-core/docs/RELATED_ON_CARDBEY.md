# Related on Cardbey — taxonomy, ranking, fallback

**Date:** 2026-07-28  
**Versions:** `TAXONOMY_VERSION=2026-07-28.1`, `RANKING_VERSION=2026-07-28.1`

## Audit (before fix)

| Step | Finding |
|------|---------|
| Storefront | `/s/:slug?from=feed` → `FeedDiscoveryTail` → `RelatedArtifactsSection` |
| Source | `sessionStorage['cardbey.feed.artifactsSnapshot']` (last feed cards) |
| Endpoint | **None** (frontend-only soft score) |
| Category used | Feed tab (`all` / `for_you`), **not** store `type` |
| Why Barber/Massage | Soft rank only; incompatible verticals kept; `/s/` + media bonuses |

## Canonical taxonomy

`businessCategory`: `FOOD_AND_DRINK` | `BEAUTY_AND_WELLNESS` | `HOME_AND_GARDEN` | `PROFESSIONAL_SERVICES` | `RETAIL` | `HEALTH` | `ENTERTAINMENT` | `OTHER`

Legacy labels normalise via alias map (e.g. `Food & drink`, `Restaurant`, `Takeaway` → `FOOD_AND_DRINK`; `Barber` / `Massage` → `BEAUTY_AND_WELLNESS`).

## Ranking weights

| Signal | Score |
|--------|------:|
| Same category | +100 |
| Same subcategory | +50 |
| Same cuisine | +30 |
| Same suburb/city | +20 |
| Complementary | +10 |
| Incompatible | −100 |

**Policy:** While same-category inventory exists, Related returns **only** those cards (fewer cards OK). Complementary only if zero same-category. General discovery is **not** labelled “Related.”

## API

`GET /api/public/stores/:slug/related?limit=8&diagnostics=1`

```json
{
  "ok": true,
  "items": [{ "id", "slug", "title", "imageUrl", "href", "score" }],
  "generalFallback": [],
  "context": {
    "sourceStoreId",
    "category",
    "subcategory",
    "location",
    "fallbackLevel",
    "taxonomyVersion",
    "rankingVersion"
  }
}
```

## Cache key

`related|{TAXONOMY_VERSION}|{RANKING_VERSION}|{storeId}|{category}|{subcategory}|{suburb}|{city}`

Invalidate when taxonomy/ranking versions bump.

## UI

- **Related on Cardbey** — `items` only (category-relevant).
- **Explore more from Cardbey** — broad discovery CTA (unchanged).
- Hide Related section when `items` is empty.
