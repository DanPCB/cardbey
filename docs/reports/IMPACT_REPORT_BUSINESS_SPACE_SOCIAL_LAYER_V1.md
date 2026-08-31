# Impact report: Business Space Social Layer V1

**Phase:** Social platform convergence audit + assessment  
**Date:** 2026-08-29  
**Verdict:** `BUSINESS_SPACE_SOCIAL_LAYER_V1_PARTIAL`  
**Code changes in this phase:** Documentation only (no runtime modifications)

---

## What could break

| Area | Risk | Why | Impact scope |
|------|------|-----|--------------|
| Global feed ranking | **None** (this phase) | No code changes to ranked feed API or `usePreparedPublicFeedArtifacts` | Global `/` |
| Global engagement rail | **None** (this phase) | `FloatingFeedActionRail` unchanged; business profile already shipped in presence convergence | Global + Business |
| Store-level like/follow semantics | **Low** if activity-level wired later | Today all feed cards resolve engagement to `storeId`; per-activity wiring would change count meaning | Global, Business, storefront shows |
| Desktop Create header | **Low** (future) | Adapting `GlobalCreateLauncher` header to Post in owned Business Space could confuse Global users if context detection wrong | `/space/:id` owners on desktop |
| Comment fork by surface | **High** (if implemented wrong) | Must use single `content-interactions` key, not `BusinessSpaceComment` | All surfaces |
| Messenger in public chrome | **Medium** (future) | New header controls affect layout on mobile glass chrome | All public routes |
| Linked businesses module | **Low** | Showing real data is additive; fake placeholders already removed | Business right rail |
| Owner self-follow | **Low** | UI hides follow for owners; API does not enforce — backend guard would be behavior change | Follow API |

---

## Why

Business Space social convergence is an **audit-and-document** phase on top of the shared feed runtime delivered in social-commerce phases A–C and presence convergence V1.

Goal: prove reuse of existing social infrastructure, classify gaps honestly, and avoid parallel Business-specific social systems.

---

## Impact scope

### In scope (assessed)

| Component | Role |
|-----------|------|
| `BusinessSpaceTheatreCanvas.tsx` | Business feed host |
| `PublicFeedShell.tsx` | Shared theatre chrome |
| `FloatingFeedActionRail.tsx` | Shared social action rail |
| `businessSpaceRailProfile.ts` | Business share semantics |
| `useStoreEngagement` / `storeEngagementApi` | Follow, like, save, share |
| `socialInteractionApi.ts` | Content-level interactions (shows; comments stub) |
| `SpaceContextRail.tsx` | Right-rail network context |
| `SpaceFollowButton.tsx` | Business follow CTA |
| `GlobalCreateLauncher.tsx` | Create vs Post |
| `PublicFeedChrome.tsx` | Global header controls |
| `projectBusinessTimelineToFeedArtifacts.ts` | Timeline → artifact projection |
| `activeSpaceContext.ts` / `businessSpaceRuntime.ts` | Context equivalents |

### Explicitly out of scope

- New Business feed or `SpaceShell` restoration  
- Personal Space convergence  
- Comment/Messenger/notification backend implementation  
- Linked business relationship API  
- Customer reviews  
- Legacy `SpaceShell` retirement (`BUSINESS_SPACE_LEGACY_SHELL_RETIREMENT_V1` deferred)

---

## Smallest safe patches (recommended, not applied in V1)

Priority order for a future implementation phase:

### 1. Desktop Post adaptation (low risk)

**Patch:** In `GlobalCreateLauncher`, when `resolveActiveSpaceContext(pathname).type === 'business'` and `isSpaceOwner`, use `spaceMode` Post semantics for `variant === 'header'`.

**Files:** `GlobalCreateLauncher.tsx`, `SpacePage.tsx` (pass `isSpaceOwner` + `activeSpace` to chrome if needed).

**Risk:** Mis-detecting owner on non-owned business pages → visitors must never see Post.

### 2. Activity-level engagement (medium risk)

**Patch:** Extend `FeedArtifact` with optional `engagementContentType` / `engagementContentId`; in `FloatingFeedActionRail`, call `useSocialInteractions` when present, else fall back to `useStoreEngagement`.

**Risk:** Dual engagement UX confusion; requires migration of counts.

### 3. Public header Messenger/Notifications (high — platform)

**Patch:** Add operational components to `PublicFeedChrome` only when backend inbox exists.

**Risk:** Layout overflow on mobile; must not remove Search/Language/Account.

### 4. Linked businesses (medium — requires Core)

**Patch:** New `StoreBusinessLink` model + `GET /api/public/stores/:id/linked-businesses`; wire into `buildBusinessSpaceRuntime`.

**Risk:** Data model design (supplier vs branch vs partner).

---

## Regression checklist (§24)

| Check | Result |
|-------|--------|
| Global feed ranking unchanged | ✓ No changes this phase |
| Global Create unchanged | ✓ |
| Global rail unchanged | ✓ |
| Business uses same rail with profile | ✓ Pre-existing |
| No `BusinessSpaceLike` fork | ✓ |
| No second Business feed | ✓ |
| Theatre not redesigned | ✓ |
| `SpaceShell` not restored for business | ✓ |

---

## Test evidence

### Unit tests (local)

```
vitest run \
  businessSpaceRailProfile.test.ts \
  businessSpacePresenceConvergence.test.ts \
  FloatingFeedActionRail.test.tsx
→ 3 files, 17 tests passed (2026-08-29)
```

### Staging browser verification

Script: `apps/dashboard/cardbey-marketing-dashboard/scripts/business-space-staging-verify.mjs`

Social round-trip E2E **not** marked PASS — requires:

- Store with published `SPACE_UPDATE` on staging  
- `STAGING_OWNER_EMAIL` / `STAGING_OWNER_PASSWORD` for Post proof  
- Operational comment/message APIs (currently absent)

---

## SOCIAL_PLATFORM_CAPABILITY_GAPS (summary)

See full matrix in `docs/BUSINESS_SPACE_SOCIAL_LAYER_V1.md`.

| Gap | Blocks READY? |
|-----|---------------|
| Comment persistence | Yes (for comment round-trip) |
| Activity-level reactions on feed | Yes (for per-activity identity proof) |
| Public Messenger / Notifications | No (platform-wide; document only) |
| Business DM | No (new capability) |
| Linked businesses API | No (empty module acceptable per spec) |
| Desktop Post | Yes (for §4/§21 owner UX) |
| Follower list | No |
| Reviews | No |

---

## Sign-off

| Criterion | Status |
|-----------|--------|
| Audit complete | ✓ |
| Social context mapped to existing infra | ✓ |
| Capability matrix documented | ✓ |
| Existing operational capabilities on Business runtime | ✓ (store-scoped social) |
| Browser-proven social round-trip | ✗ |
| All operational capabilities converged | ✗ |

**Final:** `BUSINESS_SPACE_SOCIAL_LAYER_V1_PARTIAL`
