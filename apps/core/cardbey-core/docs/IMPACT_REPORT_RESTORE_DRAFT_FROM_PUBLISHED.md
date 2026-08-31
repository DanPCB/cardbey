# Impact Report: Restore website editor draft from published live store

## Goal

On `/preview/website` (live stores), let owners reverse unexpected draft edits back to the **currently published** live version, without auto-publishing.

## Observed

Editor already distinguishes live vs draft (`publishState.isLive`, `hasUnpublishedChanges`, `liveHeroUrl`). No restore/revert control exists.

## What could break

- Restoring overwrites draft preview (hero, catalog, mini-website sections) with live Business data — unpublished draft edits are discarded.
- Incomplete live→preview mapping could drop fields (slogan, sections) if not copied from `stylePreferences.miniWebsite`.
- Calling restore when not live / no `committedStoreId` must no-op with clear error.
- Accidental restore without confirmation.

## Why

Unexpected edits (hero/menu/style) need a safe reverse; republish only pushes draft→live, not the reverse.

## Impact scope

- Core: new `POST /api/draft-store/:draftId/restore-from-published`
- Dashboard: toolbar button + confirm + reload draft; VI/EN chrome
- Does **not** change public `/s/:slug` until user republishes

## Smallest safe patch

1. Server builds preview from live Business + products + `stylePreferences` (same sources as create-from-store, plus miniWebsite/hero video).
2. Replace draft.preview; refresh publish snapshot when V1 enabled.
3. UI: button only when `publishState.isLive`; `window.confirm` before call; reload draft; no auto republish.

## Out of scope

- Multi-step undo stack
- Restore for never-published drafts
- Auto-republish after restore
