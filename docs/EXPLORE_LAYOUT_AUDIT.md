# Explore layout fix — audit

## Root cause

**Primary:** `AppShell.tsx` wrapped `/frontscreen` in a `position: fixed` container with `height: 100dvh` and `overflow: hidden`, which **prevented all vertical scrolling** — content below the carousel was clipped at the viewport bottom.

**Secondary:** `body.frontscreen-mode` (from Home feed navigation) also sets `overflow: hidden` on `html/body/#root`. Explore must clear that class on mount.

**Tertiary:** Large vertical gaps and a tall desktop video aspect (`2/1`) pushed the showcase further down when scroll was blocked.

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| Home feed mobile nav | Shared `PublicFeedMobileNav` component | New `layout` prop defaults to `fixed`; only Explore passes `inset` |
| Carousel / recommendations | Margin-only change | `mb-6` → `mb-3`; no logic changes |
| Performer CTAs | Unchanged handlers | `handleFeaturedVideoPerformerStart` → `launchExploreCapability` untouched |
| Learn more → Learn journey | `handleLearnMore` in showcase | Unchanged |
| Goal breadcrumb cards | Separate component | No changes |
| Horizontal overflow | Carousel/video arrows | `overflow-x-clip` on page wrapper |

## Changes applied

1. Explore page: `flex min-h-screen flex-col`, main `flex-1`, footer hint after video in document flow.
2. Mobile nav on Explore: `layout="inset"` — renders after main content, not over it.
3. Removed wrapper `pb-[4.5rem]` (no longer needed with inset nav).
4. Tightened carousel → video spacing; capped mobile video height for first-scroll visibility.
5. Small `<footer>` after video showcase (replaces desktop-only hint).
