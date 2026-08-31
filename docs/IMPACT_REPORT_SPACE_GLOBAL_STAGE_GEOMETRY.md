# IMPACT REPORT — Space theatre stage geometry (Global frontpage parity)

**Date:** 2026-08-25  
**Scope:** Business/Personal Space shell layout only — Global `/` frozen  
**Goal:** Match Global frontpage structure: left rail | **vertical center stage** | right rail

## Why current Space still diverges

V2 added a three-zone row, but the **center** is still a wide short banner + content below. Global’s center is a **tall stage column** (`--feed-stage-h`) with a vertical media card (~`max-w-[580px]`, rounded white column).

## Smallest safe patch

1. Reuse Global theatre CSS vars / class geometry on `SpaceShell` (`feed-theatre-row`, `feed-stage-column` height, `items-center`).
2. Make compact identity a **full-stage vertical card** (media fill + bottom identity chrome), not a 240px banner.
3. Keep tab content inside the stage column (scroll/overlay) — no new feature systems.
4. Do not modify `PublicFeedShell` / Global frontpage.

## Risks

| Risk | Mitigation |
|------|------------|
| Space tests expect short header | Update expansion/shell tests |
| Mobile overflow | Keep mobile full-width stage; tabs under or overlaid |
| Owner Ask Performer | Unchanged |
