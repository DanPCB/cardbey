# Immersive Mobile Foundation Audit

**Date:** 2026-06-07  
**Baseline commit:** Dashboard `de3c8f8` — `feat(mobile): unify primary surfaces with immersive screen shell`  
**Scope:** Evidence-only audit before `/frontscreen` migration (no code changes in this pass).

---

## Executive summary

The immersive shell baseline is **committed and correct for `/`**, but the audit is **not clean** for a unified global front. The largest visual discontinuity is **`/frontscreen`**, which still uses pre-shell layout patterns (light page background, `max-w-6xl` document, inset bottom nav, manual header offset).

| Status | Routes |
|--------|--------|
| **Shell integrated** | `/` (full), `/space/:id` hero, `/promo/:id` runway, legacy `FullScreenBackgroundLayout` consumers |
| **Partial shell** | `/s/:slug` (hero only), `/promo/:id` MI draft path |
| **No shell — migration required** | `/frontscreen`, legacy `/feed` (+ aliases) |
| **No `/explore` route** | Explore = `/frontscreen` (`ExploreDiscoveryPage`) |

**Recommended next commit:** `/frontscreen` → `ImmersiveScreenShell` with `scrollableContent={true}`.

**Legacy `/feed`:** Audit traffic/links first; prefer redirect to `/` over maintaining two feed systems.

---

## 1. Route coverage matrix

| Route | Page / entry | Current layout | Uses `ImmersiveScreenShell`? | Safe area | Desktop preserved? | Migration needed? |
|-------|----------------|----------------|------------------------------|-----------|-------------------|-------------------|
| **`/`** | `PublicHomeFeed` → `PublicFeedShell` | Kiosk `100dvh`, snap feed, fixed chrome | **Yes (full)** — shell + per-card shell | **Yes** — `--immersive-*`, nav inset, CTA offset | **Yes** — `lg:` theatre, rounded cards | **No** (baseline) |
| **`/frontscreen`** | `ExploreDiscoveryPage` | Light `bg-[var(--cb-bg)]`, `max-w-6xl` scroll doc, fixed header + **inset** bottom nav | **No** | **Partial** — manual `pt-[calc(var(--header-height)+…)]`, nav `pb-[safe-area]` only | **Yes** — desktop nav in chrome | **Yes — P0** |
| **`/explore`** | *(no route)* | Alias intent only; canonical path is `/frontscreen` | N/A | N/A | N/A | Fold into `/frontscreen` work |
| **`/s/:slug`** | `PublicStoreSlugRoute` → `WebsitePreviewPage` | Scroll storefront; theme `--wt-bg`; hero immersive on mobile | **Partial** — `HeroSection` only | **Partial** — hero uses shell; body uses `min-h-screen` + section nav | **Yes** — `lg:min-h-[60vh]` hero | **P2** — optional full-page scroll shell wrapper |
| **`/store/:slug`** | Same as `/s/:slug` | Same | **Partial** | Same | Same | **P2** |
| **`/space/:id`** | `SpacePage` → `SpaceHero` + content | Hero immersive; below-hero `max-w-5xl` white cards on `bg-background` | **Yes (hero)** | **Yes** — shell CTA/rail/safe-area on hero | **Yes** | **P2** — wrap full page or hero-only OK for now |
| **`/promo/:id`** | `PromoLandingPage` | Runway: full-bleed campaign shell; MI draft: centered white card | **Partial** — runway only | Runway: **Yes**; MI draft: card padding only | **Yes** — `lg:` card fallback | **P3** — MI draft path |
| **`/p/promo/:id`**, **`/q/.../promo/:id`** | Same | Same | **Partial** | Same | Same | **P3** |
| **`/feed`** | `PublicFeed` → `PublicFeedPage` | Legacy black `100dvh`, `GET /api/public/stores`, ±1 card windowing | **No** | **Minimal** — no unified `--immersive-*` contract | N/A (mobile-only legacy) | **Deprecate / redirect** (see §4) |
| **`/feed/:slug`**, **`/card/:slug`** | Same | Same | **No** | Same | Same | **Redirect** |
| **`/u/:handle`** | `PublicProfilePage` | `MarketingLayout` + light cards | **No** | PageShell header offset only | Yes | **P3** (separate from `PersonalProfileCard`) |

### Related public routes (not in user list, but affect “global front”)

| Route | Shell? | Notes |
|-------|--------|-------|
| `/for-business`, `/for-sellers` | No | `BusinessEntryRuntimePage`, slate doc layout |
| `/discover-business` | No | `BusinessDiscoveryPage` |
| `/greet/:shareSlug` | No | Themed `min-h-screen` centered card |
| `/preview/store/:id`, `/w/:draftId` | Partial | Preview storefront; same hero pattern as public slug |
| `PublicStorePage` (fallback) | Via `FullScreenBackgroundLayout` → shell delegate | Used when slug route errors; profile-card layout uses `PersonalProfileCard` shell |

---

## 2. Remaining non-shell layout patterns

### A. White / light page backgrounds

| Location | Pattern |
|----------|---------|
| `ExploreDiscoveryPage.tsx:322` | `bg-[var(--cb-bg,#f8fafc)]` full page |
| `WebsitePreviewPage` body | `backgroundColor: var(--wt-bg)` (often light cream) |
| `SpacePage.tsx:240` | `min-h-screen bg-background` below hero |
| `PublicStoreSlugRoute` loading | `bg-slate-50` / `bg-slate-100` spinner |
| `PromoLandingPage` MI draft | White card on gradient |
| `PublicProfilePage` | `MarketingLayout` light marketing chrome |

### B. Fixed-width content containers

| Location | Pattern |
|----------|---------|
| `ExploreDiscoveryPage` | `max-w-6xl mx-auto` main |
| `SpacePage` content | `max-w-5xl` |
| `WebsitePreviewPage` sections | `max-w-3xl` hero copy, themed content width |
| `PromoLandingPage` MI | `max-w-md` card |

### C. Duplicated safe-area / chrome handling

| Surface | Issue |
|---------|--------|
| **`/`** | Centralized via `--immersive-bottom-inset`, `--immersive-cta-offset`, `PublicFeedShell` |
| **`/frontscreen`** | Manual `pt-[calc(var(--header-height,3.5rem)+0.75rem)]`; nav uses component-level `safe-area` only; **no** `--immersive-*` |
| **`/frontscreen`** | `ConciergeHost` / `PerformerOrbGateway` use **hard-coded** bottom offsets, not shell vars |
| **`/s/:slug`** | `PerformerOrbGateway` `5.5rem+safe-area` — not aligned with feed shell math |
| **Legacy `/feed`** | No bottom nav; no CTA stack contract |

### D. Custom mobile wrappers (pre-shell)

| Component | Used by |
|-----------|---------|
| `PublicFeedChrome` + `PublicFeedMobileNav` | `/`, `/frontscreen` (duplicated integration, not shell slots on explore) |
| `FullScreenBackgroundLayout` | `PublicStorePage` fallback (now delegates to shell) |
| `CardShortView` / `FoodShortsFeed` | Legacy prototypes; `frontscreen-mode` toggles |
| `MarketingLayout` / `PageShell` | `/u/:handle`, marketing pages |

---

## 3. Baseline verification (code contract — device QA still required)

### Committed shell surfaces (`de3c8f8`)

| Check | `/` | `/s/:slug` hero | `/space/:id` hero | `/promo/:id` runway |
|-------|-----|-----------------|-------------------|---------------------|
| `100dvh` mobile | Yes | Hero only | Yes | Yes |
| Full-bleed media | Yes (cards) | Yes (hero) | Yes | Yes |
| Gradient readability | Yes (overlay + card overlay) | Yes | Yes | Yes |
| Header floats | `PublicFeedChrome` fixed | Storefront section nav / theme | Shell header slot (in-flow top bar) | None (immersive content) |
| CTA above bottom nav | `--immersive-cta-offset` on cards | Hero CTAs in-flow desktop; mobile fixed `ctaSlot` | `ctaSlot` fixed | `ctaSlot` fixed |
| Desktop not full-bleed | `lg:` rounded cards, theatre | `lg:min-h-[60vh]` | Scroll + centered content below | `lg:` card layout |

### Not verified in this audit (requires iPhone / A2HS)

- [ ] CTA not hidden by bottom nav on `/` after long scroll
- [ ] Right rail not covering identity text on smallest iPhone
- [ ] Header readable on bright Pexels / video slides
- [ ] Keyboard / composer safe-area for Performer on `/frontscreen`
- [ ] Add to Home Screen standalone (loopback media — prior PWA fix)
- [ ] Android Chrome safe-area parity

### Known code-level risks (watch list)

1. **`FloatingFeedActionRail`** — still uses `5.5rem + --feed-bottom-inset` hard-coded; works on `/` but not shared with `/frontscreen`.
2. **`ExploreDiscoveryPage`** — `PublicFeedMobileNav layout="inset"` → bottom nav in document flow; different from feed fixed overlay → **visual jump** Home ↔ Explore.
3. **`SpacePage`** — hero shell + white `bg-background` body → scroll transition out of immersive hero.
4. **`WebsitePreviewPage`** — only hero uses shell; remainder is classic ecommerce scroll.
5. **Performer / Concierge** — offset classes per-page; no shell-level keyboard inset.

---

## 4. Legacy `/feed` audit

### Routes still registered (`App.jsx`)

```
/feed
/feed/:slug
/card/:slug
/card/:slug/store
```

### Implementation

- `PublicFeedPage.tsx` — `GET /api/public/stores` (not `GET /api/public/stores/feed`)
- Black `100dvh` TikTok scroll, **windowed mount** (±1 card → black placeholders)
- **No** `ImmersiveScreenShell`, **no** `PublicFeedChrome`, **no** bottom nav

### Inbound links (grep, staging tree)

| Source | Link |
|--------|------|
| `Homepage.tsx` | `to="/feed"` (marketing homepage CTA) |
| PIL / assistant context | Treats `/feed` as `feed` surface (`assistantContext.ts`, `pilContextResolver.ts`, `usePilActivityContext.ts`) |

### Artifacts / mocks

- Mock feed hrefs point to `/frontscreen?mode=*`, not `/feed`
- Primary consumer entry is `/` (new feed), not `/feed`

### Recommendation

| Option | Action |
|--------|--------|
| **Preferred** | `Navigate` `/feed`, `/feed/:slug`, `/card/:slug` → `/` or `/s/:slug` with 301-style client redirect |
| **Minimal** | Change `Homepage.tsx` link to `/`; add redirect routes; keep PIL surface mapping |
| **Avoid** | Porting legacy `PublicFeedPage` to `ImmersiveScreenShell` (duplicate system) |

**Traffic:** No analytics in repo; confirm via production logs before removing routes.

---

## 5. `/frontscreen` migration spec (next commit)

### Target architecture

```
ImmersiveScreenShell
  variant="storefront" | custom "explore"
  scrollableContent={true}
  headerSlot={<PublicFeedChrome />}
  bottomNavSlot={<PublicFeedMobileNav layout="inset" />}
  backgroundGradient={subtle or featured-video bleed at top}
  children={
    ExploreIntentBreadcrumbBar
    → search
    → journey panel / carousel / featured videos
  }
```

### Must preserve (no logic changes)

- `usePreparedPublicFeedArtifacts` / marketplace panel
- PIL: `ConciergeHost`, `PerformerOrbGateway`, `recordExploreEvent`
- `activeIntentJourney` gating for marketplace grid
- Document scroll (do **not** apply `bodyLock` / `frontscreen-mode`)

### Must fix in migration

| Issue | Fix |
|-------|-----|
| White page margins | Remove outer `bg-[var(--cb-bg)]`; use shell background / gradient |
| Visual jump from `/` | Align chrome: same header treatment; unify bottom offset vars for orb/concierge |
| `max-w-6xl` feel on mobile | Full-bleed sections for video showcase; constrain text blocks only |
| Inset vs fixed nav | Keep inset for scroll pages but route through `bottomNavSlot` |
| Safe-area duplication | Drop manual `pt-[calc(var(--header-height)+…)]`; use shell content padding in scroll mode |

### Explore hub sections (Kling-style) inside scroll shell

1. Featured video hero (full-bleed within shell media or first section)
2. Capability cards
3. Intelligence carousel
4. Journey / marketplace panel

---

## 6. Final migration priority list

| Priority | Route / area | Action |
|----------|--------------|--------|
| **P0** | `/frontscreen` | `ImmersiveScreenShell` scroll mode — **next commit** |
| **P1** | `/frontscreen` chrome offsets | Align `ConciergeHost` / `PerformerOrb` with `--immersive-*` |
| **P1** | Legacy `/feed` | Redirect to `/`; update `Homepage.tsx`; audit PIL surface map |
| **P2** | `/s/:slug` full page | Optional scroll shell wrapper (hero + sections) |
| **P2** | `/space/:id` body | Immersive or dark continuous scroll below hero |
| **P3** | `/promo/:id` MI draft | Campaign shell for non-runway promos |
| **P3** | `/u/:handle` | Consider `PersonalProfileCard` / profile variant shell |
| **P4** | `/for-business`, `/discover-business` | Marketing shells if they remain consumer entry |

---

## 7. Audit conclusion

**The baseline commit is the right architectural move**, but the foundation audit does **not** yet come back clean for “unified global front.”

- **`/` is production-ready** for immersive mobile (pending device QA).
- **`/frontscreen` is the critical gap** — users switching Home ↔ Explore will hit different layout languages until migrated.
- **Legacy `/feed` should not receive shell investment** — redirect/deprecate after link/traffic check.

**Proceed with `/frontscreen` as the natural second commit** once iPhone spot-check passes on `/`, `/s/:slug`, `/space/:id`, and `/promo/:id` (runway).

---

## Appendix: `ImmersiveScreenShell` adoption map (post-`de3c8f8`)

```
ImmersiveScreenShell.tsx
├── PublicFeedShell.tsx          (/)           variant=feed, bodyLock
├── ArtifactCard.tsx             (feed cards)  variant=feed, fillParent
├── WebsitePreviewPage.tsx       (hero)        variant=storefront, partial
├── SpaceHero.tsx                (/space)      variant=profile|storefront
├── PersonalProfileCard.tsx      (profile UI)  variant=profile
├── PromoLandingPage.tsx         (runway)      variant=campaign
└── FullScreenBackgroundLayout.tsx (delegate)  → PublicStorePage fallback
```

**Not adopted:** `ExploreDiscoveryPage`, `PublicFeedPage`, `PublicProfilePage`, `SpacePage` wrapper, `PromoLandingPage` MI branch.
