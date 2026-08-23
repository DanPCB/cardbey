# Impact Report — Enrichment hero budget + thin description

Date: 2026-08-23  
Branch: `hotfix/enrichment-hero-desc-budget`

## What could break

- Enrichment descriptions for thin-evidence candidates become longer (≥20 words) via rule fallback when Claude returns a short sentence.
- More candidates may receive representative Pexels stock heroes (eligible tier-4), including disclosure-required stock imagery on public surfaces if display wiring is deployed.
- Slightly higher per-candidate web fetch count (cap 5 → 8): more Pexels / aggregator calls → rate-limit risk and latency.

## Why

- Production smoke (Braybrook Hotel): fetch budget burned on `"Braybrook Hotel Braybrook"` Pexels miss before category queries ran → `NO_ELIGIBLE_MEDIA`.
- Claude thin-evidence rule forced a 12-word sentence that passed validation and skipped the longer `minimalGroundedDescription` path.

## Impact scope

- `apps/core/cardbey-core` multi-source enrichment only (`heroSearchQueries`, `heroImageResolve`, `constants`, `synthesize`).
- Does **not** touch Batch 0, claim/verification status, or public publish paths.
- No Schema/API contract changes.

## Smallest safe patch

1. Reorder Pexels ladder: category/suburb **before** business name.
2. Raise `MAX_WEB_FETCHES_PER_RECORD` 5 → 8; skip name query when remaining fetches &lt; 2.
3. Claude prompt: require 20–60 words for name+category+location; reject Claude text with `wordCount < 20` and use `minimalGroundedDescription`.
