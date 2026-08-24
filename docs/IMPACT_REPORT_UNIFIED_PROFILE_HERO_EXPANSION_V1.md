# IMPACT REPORT — Unified Profile Hero Expansion V1

**Date:** 2026-08-25  
**Target:** `UNIFIED_PROFILE_HERO_EXPANSION_V1_READY`  
**Surfaces:** Personal Space + Business Space (`/space/:spaceId`)  
**Frozen:** Global Marketplace / LivingCanvas frontpage appearance and playback

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Compact Space header layout / Follow / Visit store CTAs | Medium |
| Tab state lost on expand/collapse | Medium |
| Duplicate engagement / QR handlers if a second rail is invented | Medium |
| Global feed visual/regression if Global components are edited in place | High |
| Wrong / fabricated immersive media | High (product rule) |
| Body scroll lock stuck after collapse | Medium |
| Keyboard trap / missing collapse a11y | Medium |

## (2) Why

Expand/collapse introduces a second visual mode on Space while reusing `ImmersiveScreenShell` (same shell Global/Space already share). Mistakes in composition or media selection can regress the compact foundation or invent hero assets.

## (3) Impact scope

| Area | Change |
|------|--------|
| `SpaceIdentityHeader` | Subtle expand control; compact remains default |
| `SpaceShell` / `SpacePage` | Local `heroMode` state; immersive overlay stage |
| New `CanonicalHeroStage` + `SpaceImmersiveHeroStage` | Composition over `ImmersiveScreenShell` |
| New `resolveSpaceImmersiveMedia` | Grounded media only |
| Global `PublicFeedShell` / `ArtifactMediaSurface` | **No edits** (reuse shell primitives only) |
| Store commerce `/s/:slug` | Unchanged destination |

## (4) Smallest safe patch

1. Add Space-local expand state (no new routes / history).
2. Expand → `CanonicalHeroStage` (`context=BUSINESS|PERSONAL`) wrapping `ImmersiveScreenShell`.
3. Collapse → restore compact; keep `activeTab`; do not remount feed unnecessarily.
4. Media: featured Space content → hero → show → grounded asset; else neutral expanded / stay compact.
5. CTA: existing `primaryCtaLabel` / `resolvePrimarySpaceCtaFallback` / commercial semantics.
6. QR: existing `SpaceQrModal` / `PublicActionRail` handlers.
7. ESC collapses on desktop; `aria-label` expand/collapse.
8. Regression: leave Global frontpage files untouched.

## Acknowledgement

Proceeding with the minimal safe patch above.
