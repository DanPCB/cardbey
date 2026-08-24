# UNIFIED SPACE GLOBAL COMPOSITION V2

**Status:** Implementation in progress — live verdict pending  
**Impact:** `docs/IMPACT_REPORT_UNIFIED_SPACE_GLOBAL_COMPOSITION_V2.md`  
**Frozen:** Cardbey Global Marketplace `/` (PublicFeedShell / feed playback)

## Principle

CARDBEY GLOBAL IS THE COMPOSITION REFERENCE.

Space reuses Global theatre geometry (`max-w-[1280px]`, left `w-44`/`xl:w-48`, right `w-56`/`xl:w-60`) while projecting person/business content.

## Architecture

```
SpacePage
 └─ SpaceShell (space-theatre-row)
      ├─ SpaceNavRail          ← Global feed-category-rail classes
      ├─ center column
      │    ├─ SpaceIdentityHeader (compact stage)
      │    ├─ SpaceTabs (mobile)
      │    └─ content
      ├─ SpaceContextRail      ← grounded modules only
      └─ SpaceImmersiveHeroStage (expand)
           └─ CanonicalHeroStage (desktopCentered=false)
```

## Release-blocking fix

Expanded Space no longer sets `desktopCentered`. That flag triggered CSS that hid `__media` and painted `#f8fafc` on desktop — white identity/CTA over nothing.

## Removed

- Full-width giant Space banner as desktop target  
- “Commercial destination stays on the Store page.” architecture card  

## Verdict gate

`UNIFIED_SPACE_GLOBAL_COMPOSITION_V2_READY` only after live screenshots for Global + Business compact/expanded + Personal compact/expanded + mobile.
