# Impact Report: Living Canvas F2 (Home ↔ Discovery morph)

## Goal

Prove **one window, different depths**: Home → same `GlobalPublicShell` → density `calm` → `expanded` → Discovery modules appear → **no page flash**. Preserve URLs, feed contracts, page bodies, and rails. Do **not** unify Creator / Business lenses (F3).

## What could break

1. **Route layout remount** — If `/` and `/frontscreen` were separate shell wrappers, morph would remount and flash. Mitigated: `LivingCanvasLayout` parent route keeps one shell instance.
2. **Dual body mount** — Crossfade of old+new pages risks duplicate queries/analytics/scroll. Mitigated: single `displayed` binding; body swaps only after fade-out.
3. **Scroll jump** — Expanding Discover mid-scroll could disorient. Mitigated: scroll-to-top only when expand is marked from top/mobile nav; browser back otherwise keeps natural scroll.
4. **CSS layout on immersive feed** — Aggressive shell max-width could clip home theatre. Mitigated: F2 morph primarily opacity + chrome-slot visibility; content max stays 100%.
5. **Reduced motion users** — Long phases feel broken. Mitigated: `prefers-reduced-motion` / `--reduced-motion` skips phase timers and CSS transitions.

## Why

Without a shell-owned presentation state, URL changes still feel like page navigation. F2 makes density/transition the product surface while Marketplace and Discover bodies remain adapters.

## Impact scope

- `src/lib/livingCanvas/livingCanvasPresentation.ts`, `useLivingCanvasPresentation.ts`, `publicLens.ts` (`calm`)
- `GlobalPublicShell.tsx`, `LivingCanvasLayout.tsx`, `livingCanvasMorph.css`
- `App.jsx` nested canvas routes
- `PublicFeedChrome` / `PublicFeedMobileNav` expand-from-nav markers
- Contracts + tests
- **Unrelated suite hygiene (not Living Canvas):** prior `QaReviewPage.test.tsx` mock of `fetchCandidatesPendingQa` — keep documented; do not pile more incidental repairs into this slice.

## Smallest safe patch

Shell presentation + single-body morph + CSS phases only. Pages stay authoritative for content. Overlay roots stay mounted. No Creator lens unification, no AI/Performer nav change, no URL renames.

## No-parallel-stack proof

No second public app, Intent Runtime UI, or alternate feed runtime. Morph wraps existing `PublicHomeFeed` / `ExploreDiscoveryPage` adapters inside one shell.

## Tests required

- Home → density `calm`; Discover → `expanded`
- Same shell instance across Home ↔ Discovery
- Transition phases applied; reduced-motion bypasses long phases
- Overlay roots mounted throughout
- Marketplace / Discover bodies intact; no duplicate chrome from shell slots
- Full Vitest suite green
