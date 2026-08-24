# UNIFIED PROFILE HERO EXPANSION V1

**Verdict target:** `UNIFIED_PROFILE_HERO_EXPANSION_V1_READY`  
**Date:** 2026-08-25  
**Surfaces:** Business Space + Personal Space (`/space/:spaceId`)  
**Frozen:** Global Marketplace frontpage appearance and feed playback

---

## Product rule

Profile mode provides **context**. Immersive mode provides **focus**.

```
PROFILE (compact)  ↕  IMMERSIVE (center-stage)
```

Same Space identity. Same CTAs / Follow / QR handlers. No separate application.

---

## Global hero audit

| Concern | Canonical | Reuse |
|---------|-----------|-------|
| Full-bleed shell | `ImmersiveScreenShell` | Yes — via `CanonicalHeroStage` |
| Vertical feed playback | `ArtifactMediaSurface` + feed runtime | **Not forked** — Space uses shell media layer only |
| Action rail | `PublicActionRail` (`context=space`) | Same handlers compact ↔ immersive |
| QR | `SpaceQrModal` + `ensureAbsoluteUrlForQR` path | Unchanged |
| Business CTA labels | `resolvePrimarySpaceCtaFallback` / commercial semantics | Unchanged |
| Identity expand (feed pill) | `BusinessIdentityCard` / `feedOverlayState` | Unrelated; left alone |

**Do not touch:** `PublicFeedShell`, `ArtifactFeed`, `ArtifactCard`, LivingCanvas frontpage layout.

---

## Architecture

```
SpacePage
 └─ SpaceShell (data-hero-mode=compact|immersive)
      ├─ CompactProfileHero → SpaceIdentityHeader (+ Expand)
      ├─ ProfileContent (tabs — stay mounted under dimmed chrome)
      └─ SpaceImmersiveHeroStage (when expanded)
           └─ CanonicalHeroStage (context=BUSINESS|PERSONAL)
                └─ ImmersiveScreenShell
```

`CanonicalHeroStage` also documents `context=GLOBAL` for future Global composition without inventing a third player.

---

## Compact behavior

- Default on Space open
- Cover ~220–360px, avatar, name, category/location, tagline
- Follow / Share / Call / primary CTA / tabs
- Subtle **Maximize2** expand control (`aria-label="Expand featured media"`)

## Expanded behavior

- Local UI state only (no `/fullscreen` route, no history hijack)
- Center-stage immersive via `ImmersiveScreenShell` (`bodyLock`, desktop centered)
- Collapse control (`aria-label="Return to profile"`) + ESC
- Surrounding profile chrome dimmed but **mounted** (tabs preserved)
- Neutral gradient when no grounded media (no fabrication)

## Business / Personal

| | Business | Personal |
|--|----------|----------|
| Context | `BUSINESS` | `PERSONAL` |
| CTA | Existing primary (Visit store / Book / Enquire…) | Open profile when set |
| Media | Show → hero → none | Hero/cover → featured personal media → none |
| Commercial CTA | Never invent Order now | No commercial CTA unless explicit |

## Mobile / desktop

- Mobile: full-viewport immersive shell (same as Global theatre primitives)
- Desktop: centered theatre; vertical focus (not giant horizontal cover)

## Performance

- Compact continues to use cover/poster URLs already on Space
- Immersive mounts only on expand (no eager second player)
- Shell video uses `preload="metadata"` (existing ImmersiveScreenShell)

## Accessibility

- Expand / Collapse aria-labels
- ESC collapses
- Reduced-motion: rely on existing shell (no new motion choreography)

## Tests

- `resolveSpaceImmersiveMedia.test.ts` — grounded media priority; no invent
- `SpaceHeroExpansion.test.tsx` — expand a11y, immersive collapse, shell mode
- Existing `SpaceIdentityHeader.test.tsx`
- Global smoke: `ArtifactMediaSurface.test.tsx` (4/4) — unchanged files

## Screenshots

Reference (product mock targets) under `docs/screenshots/unified-profile-hero/`:

- `mmm-fashion-desktop-compact-reference.png`
- `mmm-fashion-desktop-expanded-reference.png`

Live production captures still required for full READY:

- MMM Fashion mobile compact / expanded
- AWE desktop compact / expanded
- Personal desktop compact / expanded

## Acceptance checklist

| Gate | Status |
|------|--------|
| Compact Business profile (unit + structure) | Pass |
| Expanded Business hero (unit + ImmersiveScreenShell) | Pass |
| Compact Personal profile (same shell) | Pass (unit / structure) |
| Expanded Personal hero | Pass (context=PERSONAL) |
| Desktop / mobile CSS paths | Implemented; live device QA pending |
| Global regression (no Global file edits + media unit) | Pass |
| Canonical playback reused (`ImmersiveScreenShell`) | Pass |
| No duplicate engagement state | Pass (shared handlers) |
| Business-aware CTAs | Pass (existing primary CTA) |
| Grounded media only | Pass |

## Known limitations

- Does not reuse `ArtifactMediaSurface` slideshow/Ken Burns (Space uses shell image/video only — intentional to avoid forking feed runtime)
- Peer Message still deferred
- Live screenshot cohort on production Spaces not completed in this agent session
- `PublicFeedShell` full suite may require intact dashboard `node_modules` / test helpers

## Regression

Global Marketplace files in this change set: **none**.

## Verdict note

Implementation + unit gates are green. Live visual cohort remains the remaining READY gap → see final agent verdict.
