# Impact Report: One Living Canvas (Single Global Public Surface)

## Status

**F0 + F1 + F2 implemented**. See `docs/IMPACT_REPORT_living-canvas-f0-f1.md`, `docs/IMPACT_REPORT_living-canvas-f2.md`, and `docs/contracts/LIVING_CANVAS_F0_CONTRACTS.md`.

Next: F3 Creator / Business lens unification only after explicit go-ahead.

## Goal

Refactor public Cardbey from multi-page shells (Marketplace / Creators / Businesses / Discovery) into **one global public canvas** where navigation changes **lens / density**, not page/shell. Home stays the calm resting state; Discovery expands the same surface; Creators/Businesses/Products/etc. are lenses; AI and Performer are overlays/consoles; Creator Studio stays a dedicated workspace.

## Current state (as-built)

| Nav label | Path | Shell today |
|-----------|------|-------------|
| Marketplace | `/` | `PublicFeedShell` + `PublicFeedChrome` |
| Discover | `/frontscreen` | `ImmersiveScreenShell` + `PublicFeedChrome` |
| Businesses | `/frontscreen?tab=businesses` | Same as Discover (query only) |
| Creators | `/creators` | Ad-hoc page + `PublicFeedChrome` (not feed shell) |
| AI (chrome) | `/app?entry=performer` | Leaves public surface |
| Creator Studio | `/creator-studio/*` | Separate workspace (keep) |

Chrome is **partially** shared (`PublicFeedChrome`, `PublicFeedMobileNav`). Bodies, search UIs, category vs Explore tabs, and right rails are **not** unified. No `activeLens` contract yet.

## What could break

1. **Bookmarks / SEO** — `/frontscreen`, `/creators`, `?tab=` / `?mode=` must keep working (redirect or same canvas + lens).
2. **Feed theatre vs document scroll** — merging shells can break mobile immersive feed, scroll restore, PWA.
3. **PIL / assistant host** — today only `/` and `/frontscreen`; Creators/search lack host.
4. **Dual discovery rails** — home `PublicDiscoveryRail` vs Explore carousels/journey vs optional `DiscoveryIntelligencePanel` V2 flag.
5. **Creators data model** — showcase grid ≠ `ArtifactFeed` artifacts; forcing one feed too early breaks Creators.
6. **Performer handoffs** — Explore CTAs must stay governed (`autoSubmit: false`); morph must not auto-submit.
7. **AppShell `isFrontscreen` family** — wrong host path set → double headers or lost body class.

## Why change is process-level

Public navigation semantics shift from “go to page X” to “reveal more of the same world.” That touches routing UX, layout ownership, and entry points — not a local CSS tweak.

## Impact scope

- Dashboard public routes under `App.jsx` frontscreen family
- `PublicFeedShell`, `ExploreDiscoveryPage`, `CreatorsFeedPage`, `publicFrontNav.ts`
- Discovery features (`src/features/discovery/*`), feed chrome, PIL host gating
- **Out of scope (locked):** Creator Studio as production workspace; Intent Runtime / Kernel rewrite; Core schema unless a lens API is proven necessary later

## Smallest safe patch sequence (wrap, don’t rewrite)

| Phase | Deliverable | User-visible | Risk |
|-------|-------------|--------------|------|
| **F0** | Contracts: `activeLens`, shell slots, route→lens map, overlay vs workspace rules; impact + no-parallel-stack proof | Docs only | Low |
| **F1** | `GlobalPublicShell` composing existing chrome + body slot; mount Home/Explore/Creators as **modes** without deleting pages | Same URLs, one chrome host | Medium |
| **F2** | Home ↔ Discovery **morph** (fade/expand ~600–800ms); Discover expands density on same shell | “Discovery transforms page” | Medium–high |
| **F3** | URL-backed lenses (`home` \| `discovery` \| `creators` \| `businesses` \| products/services/offers/videos/articles); ranking/filters/modules by config | Creators/Businesses feel like lenses | High if Creators forced into ArtifactFeed too early |
| **F4** | AI = overlay-only entry from public chrome; Performer = mission console over preserved canvas state | No “leave Cardbey” for AI assist | Medium |

## No-parallel-stack proof

- Does **not** add a second Intent Runtime, MI Runtime, or alternate feed product.
- Reuses `PublicFeedChrome`, prepared feed hooks, existing Explore `tab`/`mode`, governance handoffs.
- Creator Studio / Performer `/app` remain workspaces — not folded into Discovery.
- Domain pages become **adapters** into one shell + lens config, not a parallel Marketplace app.

## Design filter (locked)

Every public interaction answers: **“How much more of this world do you want to see?”** — not “Which page do you want to visit?”
