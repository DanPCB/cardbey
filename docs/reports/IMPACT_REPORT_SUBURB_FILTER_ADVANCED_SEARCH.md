# IMPACT — Pack suburb filter chips into advanced search

**Date:** 2026-09-03  
**Issue:** Suburb / location pills under the frontpage search (desktop + mobile) stay visible at all times and clutter the stage.

## Change

- Remove always-on `SuburbFilterPills` from under the desktop search band and from the mobile category `leadingSlot`.
- Expose the same pills inside search as an **advanced filter** (toggle on `UnifiedSearchBar` + expanded mobile header search).
- When a suburb is active and the panel is closed, show only a compact clearable chip so the filter stays discoverable.

## What could break

- Users who relied on always-visible suburb chips must open Filters once (intended).
- Active `?suburb=` URLs still work; compact chip + clear remain.
- Category rails / feed APIs unchanged.

## Scope

Frontpage search chrome + mobile header search only.
