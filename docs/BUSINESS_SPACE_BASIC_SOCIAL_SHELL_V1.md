# Business Space — Basic Social Commerce Shell V1

**Target:** `BUSINESS_SPACE_BASIC_SOCIAL_SHELL_V1_READY`  
**Date:** 2026-08-29  
**Phase type:** Structural / layout — not full social platform completion

---

## Purpose

Reshape Business Space into the basic operating structure for business-first social commerce:

```
Cardbey Global → Business identity/activity → Business Space → continuous stream → Visit Store → /s/:slug
```

Same feed/theatre family as Global; difference is **data scope** (one business vs network).

---

## Reused architecture (audit)

| Layer | Component | Reused? |
|-------|-----------|---------|
| Route | `SpacePage.tsx` | ✓ |
| Theatre | `BusinessSpaceTheatreCanvas.tsx` | ✓ |
| Shell | `PublicFeedShell.tsx` | ✓ extended |
| Stream | `ArtifactFeed` | ✓ unchanged |
| Rail | `FloatingFeedActionRail` | ✓ unchanged |
| Context | `ActiveSpaceContext`, `BusinessSpaceRuntime` | ✓ |
| Post | `SpacePostSheet` + space-updates API | ✓ |
| Share | `businessSpaceRailProfile` | ✓ |
| Right rail | `SpaceContextRail` | ✓ |
| Left nav | Theatre `navItems` from capability tabs | ✓ |
| Spotlight UI | `SpaceAffiliateSpotlight` | ✓ relabelled |
| Visit store | `visitStoreHref` → `/s/:slug` | ✓ |

**Not restored:** `SpaceShell` as primary UI  
**Not created:** New feed, theatre, comment API, messenger, notifications

---

## Structural changes (this phase)

### 1. Header — contextual + Post (desktop owner)

`PublicFeedChrome` resolves `ActiveSpaceContext` + store ownership.

| Surface | Viewer | Header CTA |
|---------|--------|------------|
| Global `/` | any | `+ Create` → `CreateSheet` |
| Business Space | owner | `+ Post` → `SpacePostSheet` |
| Business Space | visitor | `+ Create` → `CreateSheet` (cannot post as business) |

Files: `GlobalCreateLauncher.tsx`, `PublicFeedChrome.tsx`

### 2. Remove large Business Space search band

`theatreOverrides.hideTheatreSearch: true` on Business Space lens.

- Desktop theatre search (`UnifiedSearchBar` full variant) hidden
- Global header search icon unchanged (network discovery)
- Theatre row top padding adjusted when search hidden

### 3. Activity composer shell (bottom of theatre)

`BusinessActivityComposerSlot` — structural placeholder:

- Follows active artifact via `feedActiveItemStore`
- Exposes `sourceType`, `sourceId`, `artifactId`, `storeId`
- Tap → honest `openComments` toast (no fake persistence)
- Desktop only (`lg:block`) to avoid mobile nav overlap

### 4. Business Spotlight slot (left rail)

`resolveBusinessSpotlight()` — deterministic priority:

1. **PARTNER** — real `livePartnerItems` only (fixtures excluded → `PARTNER_DATA_PLACEHOLDER`)
2. **BUSINESS_FEATURE** — promotion → show → offering
3. **NONE** — slot hidden

Reuses `SpaceAffiliateSpotlight` with `spotlightKind: 'partner' | 'business_feature'`.

### 5. Preserved regions

| Region | Content |
|--------|---------|
| Left | Business nav tabs, categories, spotlight |
| Center | `ArtifactFeed` stream / tab panels |
| Right | Follow, connections, live, presence, location |
| Rail | Activity + business actions (existing) |

---

## Owner vs public (same shell)

| Capability | Public | Owner |
|------------|--------|-------|
| Stream | ✓ | ✓ |
| Follow / interact | ✓ | ✓ |
| Post | ✗ | ✓ (desktop header + mobile nav) |
| Management chrome | hidden | subtle (existing prompts only) |

---

## Mobile (unchanged nav)

`Home · Shows · Post · Assistant · Me` — no redesign this phase.

---

## Tests (local)

```
12 passed — GlobalCreateLauncher, businessSpaceBasicSocialShell, resolveBusinessSpotlight
```

---

## Deferred (explicit — §33)

- Real comment API/thread
- Activity-level like/save persistence review (separate phase delivered)
- Messenger, notifications, Business DM
- Follower list, linked-business backend
- Sophisticated continuous stream composition
- Business collections system
- Detailed owner management UX
- Personal Space convergence
- Responsive polish pass

---

## Browser evidence

Staging script: extend `business-space-staging-verify.mjs` with shell checks:

- `hideTheatreSearch` — no desktop `UnifiedSearchBar` in business lens
- `feed-theatre-stage-composer` present on content tab
- `data-space-spotlight` attribute on theatre canvas

Capture: DESKTOP OWNER / VISITOR, MOBILE OWNER / VISITOR at 1440+ and 390+.

---

## Related

- `docs/BUSINESS_SPACE_SOCIAL_LAYER_V1.md`
- `docs/CARDBEY_ACTIVITY_LEVEL_ENGAGEMENT_V1.md`
- `docs/reports/IMPACT_REPORT_BUSINESS_SPACE_BASIC_SOCIAL_SHELL_V1.md`
