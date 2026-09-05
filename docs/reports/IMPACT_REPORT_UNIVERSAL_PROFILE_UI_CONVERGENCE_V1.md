# IMPACT REPORT — Universal Profile UI Convergence (v1)

## Intent

Unify Creator, User, and Business **public identity** presentation onto one Cardbey Global theatre shell (`PublicFeedShell`). Identity type becomes metadata (data, capabilities, modules) — not a separate page layout.

## Locked rule

**CARDBEY_PROFILE_UI_RULE_V1:** Identity type must never determine public profile layout. Creator, User and Business use one Universal Profile UI. Identity type determines only data, capabilities, modules and purpose.

## What could break

1. **Creator profile (`/creator/:username`)** — leaving custom banner layout for theatre may change bookmarks / SEO / Follow UX until actions are capability-wired.
2. **User profile (`/u/:handle`)** — leaving `MarketingLayout` + full `PublicHeader` for `PublicFeedChrome` theatre changes chrome and mobile nav.
3. **Business storefront (`/s/:slug`)** — **must not** be forced into profile theatre in v1; commerce WebsitePreview remains resource destination.
4. **Business Space (`/space/:id`)** — already on `PublicFeedShell`; avoid double-wrapping or competing shells.
5. **Creator content detail** — already on theatre; only share identity/rail primitives.

## Why

Separate shells (`CreatorProfilePage` banner, `PublicProfilePage` marketing card, `SpaceShell` vs theatre) violate Global continuity. Shared geometry already exists in `PublicFeedShell`; adapters + UniversalProfileTheatreCanvas are the smallest path.

## Impact scope

| Surface | v1 action |
|---------|-----------|
| `/creator/:username` | Migrate → UniversalProfileTheatreCanvas |
| `/u/:handle` | Migrate → UniversalProfileTheatreCanvas |
| `/space/:businessId` theatre | Already shared — adapter only |
| `/s/:slug` WebsitePreview | **Out of scope** (commerce resource, not identity shell) |
| `/creator/.../content/...` | Reuse UniversalProfile identity/rail primitives |
| Account / Me / Studio | Unchanged |

## Smallest safe patch

1. Codify rule + types + module registry + adapters.
2. Ship `UniversalProfileTheatreCanvas` (wraps `PublicFeedShell`).
3. Migrate Creator + User public profile pages only.
4. Leave business commerce on WebsitePreview; document Space theatre as already converged.
5. No deletion of business/creator/user APIs or capabilities.

## Migration risks

- Visual change on Creator/User profiles (intentional).
- Follow/message capabilities may remain stubbed where they already were.
- Full module parity (reviews, collections, etc.) is incremental — registry exists; empty modules show empty states.
