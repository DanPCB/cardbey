# Living Canvas F0 Contracts

Canonical audit: `docs/IMPACT_REPORT_one-living-canvas.md`  
Slice: **F0–F2** (contracts + host + Home↔Discovery morph). F3 lens unification deferred.

## Operating model

```
User → GlobalPublicShell (one canvas)
     → activeLens + density
     → body (existing page content models for F1)
     → reserved overlay roots (AI / Performer — empty until F4)
```

Workspaces (`/creator-studio`, `/app`, admin) are **outside** the living canvas.

## Public lenses (`PublicLensId`)

| Lens | Meaning | Typical route (F0 map) |
|------|---------|------------------------|
| `home` | Resting marketplace feed | `/` |
| `discovery` | Expanded explore / discover | `/frontscreen` |
| `creators` | Creators showcase | `/creators` |
| `businesses` | Businesses explore tab | `/frontscreen?tab=businesses` |
| `products` | Products explore mode | `/frontscreen?mode=products` (or tab) |
| `services` | Services | `/frontscreen?mode=services` |
| `offers` | Offers | `/frontscreen?mode=offers` |
| `food` | Food | `/frontscreen?mode=food` |
| `videos` | Reserved (F3) | — |
| `articles` | Reserved (F3) | — |

## Density

| Density | When |
|---------|------|
| `calm` | `home` only — calm / resting marketplace |
| `expanded` | discovery and other public lenses |

> F0 originally named this `resting`; F2 locks the public contract to `calm` | `expanded`.

## Shell slots (`GlobalPublicShellSlots`)

Documented for F2+; **F1 does not hoist chrome** (pages keep existing chrome to preserve visible behavior).

- `header` — GlobalHeader / PublicFeedChrome
- `search` — GlobalSearch
- `discoveryNavigation` — left / lens nav
- `feedViewport` — primary feed / showcase body
- `discoveryIntelligence` — right rail panel
- `feedFilterBar` — chips / filters
- `featuredCarousel`
- `feedModule` / `creatorModule` / `recommendationModule`
- `aiOverlay` — reserved portal root (F4)
- `performerConsole` — reserved portal root (F4)

## Route resolver

`resolvePublicLensFromLocation(pathname, search)` → `{ lens, density, surface }`.

- Public canvas paths: `/`, `/frontscreen`, `/creators`
- Workspace: `/creator-studio`, `/app`, … → `surface: 'workspace'` (no canvas host required)
- Other public (`/search`, `/s/:slug`, …) → `surface: 'other'` for F1 (not wrapped unless listed)

## F1 non-goals (historical)

- No Home↔Discovery morph animation (delivered in F2)
- No unifying Creators into ArtifactFeed or shared filter model (F3)
- No changing AI / Performer navigation (F4)
- No URL renames; existing bookmarks stay

## F2 presentation (`LivingCanvasPresentation`)

Shell-owned morph state (not page-owned):

```ts
type LivingCanvasPresentation = {
  density: 'calm' | 'expanded';
  transitionPhase: 'idle' | 'fading_out' | 'reflowing' | 'fading_in';
  previousLens?: PublicLensId;
};
```

- One shell, one active body binding (no dual-mount crossfade).
- Overlay roots (`aiOverlay`, `performerConsole`) stay mounted through phases.
- `prefers-reduced-motion: reduce` → skip long phases; immediate layout + density.
- Scroll: reset to top on calm→expanded only when expand was marked from top nav; per-lens scroll persistence reserved.

## No-parallel-stack proof

One shell host + lens descriptors. No second feed runtime, Intent Runtime UI, or Marketplace app. Existing pages remain adapters inside the shell.
