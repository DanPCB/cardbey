# Impact Report: Store Creation Semantic Precision V1

**Goal:** P0 precision harden on recovered research/catalog path — no redesign.

## What could break
- Research catalogs lose nav-category rows as products (intended → categories/filters).
- Soft zero prices disappear from preview (intended — UNKNOWN ≠ FREE).
- Florist CTAs shift from Book to Order/Enquire (intended).
- About/story text regenerates when prompt-shaped (intended).

## Smallest patches
1. `stripSeoBusinessDisplayName` at identity write
2. Catalog record classify + filter commerce items
3. Price semantics: null/≤0 → UNKNOWN display
4. Florist/retail → not Book by default
5. Reject "Create a store for…" in website about

## Rollback
Revert listed files.
