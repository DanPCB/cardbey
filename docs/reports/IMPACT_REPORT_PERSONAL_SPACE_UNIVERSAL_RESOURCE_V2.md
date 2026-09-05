# IMPACT REPORT — Personal Space + Universal Resource Detail (v2)

## Intent

1. Mount personal Space (`/space/personal`, `/space/me`) on `UniversalProfileTheatreCanvas` (same Global theatre as Creator/User public profiles).
2. Introduce `UniversalResourceDetail` shell and wrap creator content detail as the first consumer (resource type drives renderer; owner type does not).

## What could break

1. Personal Space owner UX (switcher immersives, list rails for Saved/Recent/Drafts) if SpaceShell features are dropped without parity.
2. URL `?tab=` sync if module ↔ tab mapping drifts.
3. Creator content detail if wrapper changes chrome unexpectedly.

## Why

Personal Space was the last primary identity surface still on `SpaceShell`. Resource detail lacked a named universal entry point.

## Impact scope

- `SpacePage` personal early-return only (business theatre unchanged)
- Creator content detail page wrapper
- Profile module ids: add `connections`, `shows`
- Feature flag default ON (mirrors business theatre)

## Smallest safe patch

1. `personalSpaceToUniversalProfile` adapter + flag `isPersonalSpaceUniversalTheatreEnabled`
2. SpacePage early return → UniversalProfileTheatreCanvas; reuse `renderTab()` bodies
3. Keep SpaceShell for personal when flag off / list mode (`activeListId`)
4. `UniversalResourceDetail` thin wrapper around existing `CreatorContentTheatreCanvas`
5. Do not fold `/s/:slug` storefront into profile theatre

## Rollback

Set `VITE_ENABLE_PERSONAL_SPACE_UNIVERSAL_THEATRE_V1=false`.
