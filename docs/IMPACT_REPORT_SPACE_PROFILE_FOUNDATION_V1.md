# IMPACT REPORT — Space Profile Foundation V1

**Date:** 2026-08-25  
**Verdict target:** `SPACE_PROFILE_FOUNDATION_V1_READY`  
**Scope:** Personal Space + Business Space only. Global Marketplace / front page **frozen**.

## Current state (audit summary)

- Single route: `/space/:spaceId` (`SpacePage.tsx`) with immersive full-viewport `SpaceHero` + placeholder “Products / Slideshows / Campaigns” cards.
- No `SpaceShell`, no tabs, no Connected Presence, no catalog/shows/live projection in Space.
- Resolve paths already exist: `resolveBusinessSpaceData`, `resolvePersonalSpaceData`, `buildPersonalSpace` / `buildBusinessSpace`.
- Reuse candidates: `ProfileSocialLinks`, `fetchStoreShows` / featured works, preview catalog, `StorefrontLiveSection` / `fetchPublicStoreLiveSession`, `launchPerformerEntrypoint`, `PublicActionRail`.

## What could break

1. **Space hero UX** — Replacing `100dvh` immersive hero with a compact identity header changes first paint and scroll behaviour for `/space/*`.
2. **Deep links / QR** — Share URLs and rail actions must keep working; Performer / Call / Share / QR must not regress.
3. **Owner edit entry** — Business owner “Edit profile” must still reach `/dashboard/stores/:id/profile`.
4. **Visit store CTA** — Must still route to canonical `/s/:slug` (or locked space), never replace the Store.
5. **Dashboard submodule** — Changes land in `cardbey-marketing-dashboard`; monorepo bump required for staging/live.

## Why

Space is a Phase-1 placeholder below an immersive hero. Product needs Cardbey identity pages (content-first) matching Global visual grammar without duplicating Store / Live / Shows / Performer systems.

## Impact scope

| Area | Impact |
|------|--------|
| Global `/`, LivingCanvas, PublicFeedShell | **None** (frozen) |
| `/space/:spaceId` | Major UI replace (shell + tabs) |
| Storefront `/s/:slug` | None (link target only) |
| Core APIs / DB | None required for V1 (projections only) |
| Auth | None |

## Smallest safe patch

1. Add shared `SpaceShell` + compact `SpaceIdentityHeader` (keep rail/share/Performer via props).
2. Replace placeholder main with tabs projecting **existing** store/user data only.
3. Truthful empty states; remove “foundation only” copy.
4. `ConnectedPresence` = LINKED links via `ProfileSocialLinks` (never fake CONNECTED).
5. No new feed DB, no new live engine, no Global redesign.

## Implementation status (2026-08-25)

Landing in dashboard branch `feat/space-profile-foundation-v1` (worktree). See `docs/SPACE_PROFILE_FOUNDATION_V1.md`.

## Rollback

Revert dashboard submodule pointer; Space returns to immersive hero + placeholders.
