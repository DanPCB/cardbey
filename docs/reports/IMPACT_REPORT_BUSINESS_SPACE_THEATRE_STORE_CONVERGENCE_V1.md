# IMPACT REPORT — Business Space Theatre Store Convergence V1

**Date:** 2026-09-05  
**Mission:** `BUSINESS_SPACE_THEATRE_STORE_CONVERGENCE_V1`

## Audit (A–F)

| Piece | Classification | Notes |
|-------|----------------|-------|
| A. Global theatre | **REUSE** | `PublicFeedShell` + `--feed-stage-h` + `FloatingFeedActionRail` |
| B. Business Space theatre | **WRAP** | Already mounts shell; commerce `stagePanel` breaks inner 600px geometry |
| C. Interaction rail | **SMALL PATCH** | Same rail; hide or gutter when commerce panel |
| D. Menu/catalog | **SMALL PATCH** | GRID exists; hospitality CTA defaults to “View menu” |
| E. Categories | **SMALL PATCH** | Filter works; Services→Content jump unnecessary |
| F. Long-tail | **REUSE** | `ownBusinessContentComplete` already gates |

## What could break

1. **Global feed** — if shell stagePanel classes leak without override gate  
2. **Services/About tabs** — layout density if max-width applied too broadly  
3. **CTA labels** — tests expecting `View menu` for hospitality  
4. **Rail hide** — media tabs must keep rail

## Why

`stagePanel` replaces `ArtifactFeed` but rail stays `absolute right-3` over the stage column → overlaps CTAs (screenshot 1C).

## Impact scope

Business Space theatre Content (with offerings), Services tab, offering CTA copy, category click when already on Services. Global frontpage unchanged if overrides only.

## Smallest safe patch

1. Constrain `feed-theatre-stage-panel` content to `max-w-[600px]` + rail gutter via override  
2. `hideFloatingRail` when commerce/non-media stagePanel  
3. Hospitality offering CTA: `Order` if supported else `View details` (not `View menu`)  
4. Category click: filter in-place when already on services  
5. Keep `/s/:slug` as View Full Website only
