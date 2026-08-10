# Impact Report — Business space switcher (mobile) unreadable / looks empty

**Date:** 2026-07-31  
**Surface:** `/space/:id` SpaceSwitcher bottom sheet (store / business space UI)

## Root cause

Space pages mount `SpaceSwitcher` with `variant="immersive"` (white text for dark chrome). On mobile, the panel is a **light** bottom sheet (`bg-background`), but panel children still receive `immersive` colors (`text-white`). Result: only avatar initials remain visible; business names, “Currently Active”, and list labels disappear (white-on-white). Duplicate initials (e.g. two “TE”) can also appear when the stores array contains duplicate store ids.

## What could break

- Mobile space sheet uses default (light) panel styling instead of immersive white text — intentional for readability.
- Desktop immersive popover unchanged (still dark shell + white text).
- Deduping stores by id removes duplicate rows for the same store; distinct stores that share initials still show separately.

## Impact scope

- `SpaceSwitcher.tsx` — panel variant forced to `default` when mobile sheet is used
- `buildSpaceSummaries.ts` — dedupe business spaces by store id

## Smallest safe patch

Keep immersive trigger chrome; render sheet content with readable default theme; dedupe store list by id.
