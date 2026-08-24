# IMPACT REPORT — Unified Space Global Composition V2

**Date:** 2026-08-25  
**Surfaces:** Business Space + Personal Space (`/space/:spaceId`)  
**Frozen:** Cardbey Global Marketplace frontpage (`PublicFeedShell` / feed playback) — zero visual regression  
**Status:** Audit complete — implementation may proceed with smallest safe patches below

---

## (1) Why Space currently diverges from Global

| Divergence | Cause |
|------------|--------|
| Full-width banner + narrow content | `SpaceIdentityHeader` is outside the content container (`w-full`); body uses `max-w-5xl` only for tabs/content (`SpaceShell`) |
| No left context rail | `SpaceShell` never mounts a left aside; tabs are a horizontal pill row under the hero |
| Architecture Store card | `SpacePage` right rail hard-codes “Commercial destination stays on the Store page.” |
| Feels like another website | Space uses a classic “profile page” stack instead of Global’s `feed-theatre-row` three-zone grid (`max-w-[1280px]`, left `w-44`, center stage, right `w-56`) |

Global composition reference: `PublicFeedShell` → `.feed-theatre-row` | `.feed-category-rail` | `.feed-stage-column` | discovery rail.

---

## (2) Why expanded hero is a near-empty / white viewport (RELEASE BLOCKING)

`SpaceImmersiveHeroStage` sets `desktopCentered` on `CanonicalHeroStage` → `ImmersiveScreenShell`.

At **≥1024px**, `index.css` intentionally hides immersive media for storefront “desktop theatre”:

```css
.immersive-screen-shell--desktop-center:not(.immersive-screen-shell--fill-parent) {
  background: var(--cb-bg, #f8fafc);
}
.immersive-screen-shell--desktop-center:not(.immersive-screen-shell--fill-parent)
  .immersive-screen-shell__media {
  display: none;
}
```

Space paints **white** identity/CTA over that light canvas → blank white stage. Mobile (&lt;1024) still shows media. This is a CSS contract mismatch, not missing BrayBrook assets.

---

## (3) Global primitives to reuse (do not fork)

| Primitive | Path | Space use |
|-----------|------|-----------|
| Theatre geometry / class names | `PublicFeedShell` / `index.css` (`.feed-theatre-row`, rails, `--feed-stage-h`) | Same desktop grid widths/gaps |
| `ImmersiveScreenShell` via `CanonicalHeroStage` | `components/layout`, `components/hero` | Expanded media — **without** `desktopCentered` (or with `fillParent`) |
| `PublicActionRail` | `components/public` | Compact + immersive (already) |
| Tab/archetype labels | `spaceTabLabels` / `spaceCommercialSemantics` | Left nav labels (Menu/Shop/Services) |
| About / catalog / shows projections | `lib/space/*Projection` | Right-rail modules only when data exists |
| Empty feed gating | `SpaceFeedEmpty` | Owner-only Ask Performer (already correct) |

**Do not** mount `ArtifactFeed` / `ArtifactCard` for Space identity. **Do not** change Global `/` appearance.

---

## (4) Space-specific adapters required

1. **`SpaceTheatreShell`** (evolve `SpaceShell`) — three-zone desktop grid; mobile = compact identity → horizontal nav → content  
2. **`SpaceNavRail`** — projects existing tabs (+ grounded secondary catalog categories only) into left rail styling  
3. **`SpaceContextRail`** — replace architecture Store card with collapse-when-empty modules (hours, location, contact, social, Visit store CTA)  
4. **Compact stage** — move identity header into **central column**; reduce banner to stage-width compact media (not browser-full-width)  
5. **Immersive expand** — drop `desktopCentered` on Space expand so media fills the stage on desktop; keep ESC / collapse / tab state mounted  

---

## (5) What could break / impact scope

| Risk | Severity | Mitigation |
|------|----------|------------|
| Global ImmersiveScreenShell CSS change | High | **Do not** change the `desktopCentered` rule globally; only Space expand stops using it |
| Space tests expecting full-width header / store card copy | Medium | Update Space shell / empty / expansion tests |
| Owner vs public empty CTAs | Low | Keep existing `isOwner` gate; no public Ask Performer |
| Right rail empty on sparse businesses | Low | Collapse empty modules (allowed) |
| Scroll / tab restore on collapse | Low | Keep compact tree mounted (already) |

**Impact scope:** dashboard Space components + SpacePage + related tests. Global `PublicFeedShell` / Living Canvas frozen.

---

## (6) Smallest safe patch sequence

1. Fix immersive: `desktopCentered={false}` on Space expand (+ assert media visible in tests).  
2. Refactor `SpaceShell` to Global theatre grid + left nav rail + contextual right rail.  
3. Nest compact hero in center column; remove disconnected Store architecture card.  
4. Live screenshots + acceptance on BrayBrook / MMM / AWE / Personal — then verdict.

**Proposed verdict after live verify:** `UNIFIED_SPACE_GLOBAL_COMPOSITION_V2_READY` or `PARTIAL` with exact remaining defects.
