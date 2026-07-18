# Impact Report — Menu import modal truncated actions

**Date:** 2026-07-18  
**Scope:** `MenuUploadModal` in `postBuildInlineUi.tsx` (+ layout review height)  
**Goal:** Keep Apply / Back / Retry fully visible when review content is tall.

## What could break

1. Short menus get a taller empty modal if we force full `90vh` height.
2. Footer always visible may reduce scroll viewport for layout preview.

## Why

Modal uses `max-h` + `flex-1` scroll without a hard height/`min-h-0` chain, so tall layout review content expands past the viewport and `overflow-hidden` clips the action buttons.

## Impact scope

- Pin modal height with `dvh`, keep body `min-h-0 flex-1 overflow-y-auto`
- Move review actions to `shrink-0` footer
- Slightly shorten layout preview max height

## Smallest safe patch

Layout-only CSS/structure in the modal; no extract/apply behavior change.

## No-parallel-stack proof

Same MenuUploadModal surface; no new dialog stack.
