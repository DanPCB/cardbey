# IMPACT REPORT — Business Space via Global PublicFeedShell

**Date:** 2026-08-25  
**Goal:** Business Space uses the **same** `PublicFeedShell` theatre as Global `/` (CreatorLens pattern), with store-scoped rails and a single-store center stage.

## Why current Space still diverges

SpaceShell copies Global *widths* but is a parallel layout. Global’s exact structure is `PublicFeedShell` (chrome, search band, `feed-theatre-row`, ArtifactFeed card, FloatingFeedActionRail, discovery rail). Business Space must mount that shell, not approximate it.

## Smallest safe approach

1. Add `BusinessSpaceTheatreCanvas` wrapping `PublicFeedShell` with `theatreOverrides` (store nav + store discovery rail).
2. Project the resolved store into 1+ `FeedArtifact`s (`passThroughArtifacts`).
3. Route business `/space/:id` through this canvas when Social Shell / theatre flag is on; keep Personal on existing SpaceShell for this pass if needed (or same shell with personal projection).
4. Do **not** modify Global Marketplace default path.

## Risks

| Risk | Mitigation |
|------|------------|
| Artifact projection incomplete | Reuse existing store→feed / preview media helpers |
| Space expand hero conflict | Keep expand as overlay OR use feed identity expand; don’t fork media player |
| Personal Space regression | Gate Business-only first if Personal adapters incomplete |

Proceeding with Business Space → PublicFeedShell.
