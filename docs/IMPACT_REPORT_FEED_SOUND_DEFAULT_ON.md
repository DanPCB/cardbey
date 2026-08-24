# IMPACT REPORT — Feed sound default on

**Date:** 2026-08-25  
**Surface:** Global Marketplace feed + shared sound preference (all video surfaces using `soundPreference`)

## (1) What could break

| Risk | Severity |
|------|----------|
| Autoplay blocked if we unmute before play on strict browsers | Medium |
| iOS still requires gesture (cannot force audible autoplay) | Expected |
| Users who intentionally muted may hear sound again if storage key bumps | Low–Medium |
| Speaker toggle tests / UX timing | Low |

## (2) Why

Preference already defaults to `true`, but (a) feed videos always start muted, (b) `applyIosFeedVideoAttrs` ignores preference unless a prior unmute gesture, and (c) `toggleActiveFeedSound` treats “preference on + video muted” as “turn preference off” — so the rail stays on the mute icon and the first tap silences preference instead of enabling audio.

## (3) Impact scope

- `src/lib/feed/feedSoundBridge.ts` (+ tests)
- `src/components/publicfeed/runtime/ArtifactMediaSurface.tsx`
- `src/lib/media/soundPreference.ts` (storage key bump so stuck `0` from buggy toggle resets)
- Shared consumers of `getSoundEnabled()` (storefront hero, rails) — preference semantics unchanged when on/off

## (4) Smallest safe patch

1. Unmute path: when video is muted, unmute (do not flip preference off).
2. After muted autoplay on desktop/Android, apply preference via existing `tryUnmutePlayingVideo` and set `userUnmutedRef` on success.
3. Mute attribute helper respects `getSoundEnabled()` on non‑iOS primary cards.
4. Bump `cardbey.sound.enabled.v2` so default-on is restored for sessions stuck muted by the old toggle.

Proceeding with this patch.
