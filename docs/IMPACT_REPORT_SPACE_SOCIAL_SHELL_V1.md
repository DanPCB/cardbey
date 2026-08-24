# IMPACT REPORT — Space Social Shell V1

**Date:** 2026-08-25  
**Surfaces:** `/space/:spaceId` Personal + Business only  
**Frozen:** Global Marketplace `/` feed playback, Store, Live market APIs, Performer

## Goal

Complete surrounding Global-style shell (header + left/right context rails) with real data where available and controlled empty placeholders otherwise. No fabricated people, counts, businesses, Live, or social connections.

## What could break

| Risk | Severity | Mitigation |
|------|----------|------------|
| Global header remounts feed when leaving `/` | Expected | Mount `PublicFeedChrome` on Space only; do not nest full PublicFeedShell |
| Right-rail Store CTA duplication | Low | Remove primary Store module; keep hero CTA |
| Owner-only Lists/Drafts leak to public | High | Gate Lists + Drafts + Connect CTAs on `isOwner` |
| Fake connection counts | High | Empty/placeholder modules never invent counts or avatars |
| Feature flag off regresses rails | Low | Default ON for Space; flag can disable enhanced rails |

## Global primitives reused

- `PublicFeedChrome`
- `InstallQRCode` (inline)
- Existing `SpaceShell` / stage / expand
- `projectBusinessAbout` / social links / live client / `SpaceFollowButton` / `useCurrentUser().stores`

## New adapters (UI only)

- `spaceModuleState.ts` — CONNECTED | EMPTY | COMING_SOON | OWNER_ACTION_REQUIRED
- `spaceSocialShellFeatureFlags.ts` — `VITE_ENABLE_SPACE_CONTEXT_RAILS_V1`
- Personal/Business left + right rail composition components

## Smallest safe patch

1. Wrap Space with Global chrome.
2. Expand nav rail (Personal LISTS + QR; Business QR).
3. Replace Store-first context rail with relationship modules + placeholders.
4. Owner/public empty content composition.
5. Unit tests for module state + owner gating.

Proceeding with this patch.
