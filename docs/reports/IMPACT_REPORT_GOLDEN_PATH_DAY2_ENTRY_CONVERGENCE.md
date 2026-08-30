# Impact Report — Golden Path Day 2 Entry Convergence

**Gate target:** `CARDBEY_V1_GOLDEN_PATH_DAY2_ENTRY_CONVERGED`  
**Scope:** Dashboard routing only — no core intake, Orchestra, or post-create redirect changes.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Users bookmarked old partial `/app?starter=create_store` links | `createNewBusinessHref` now includes full canonical params (`onboarding`, `starter`, `source`) | Params are additive; existing bookmarks still match `pendingBusinessOnboarding` sanitizers |
| Explore `create_store` stops prefilling custom intent text | Switched from `openPerformerIntent` to `createStoreEntryRoute` navigate | Aligns with Day 2 — canonical runway auto-dispatches `create_store` |
| Homepage loses Quick Start orchestra path as primary | `HomeCreateEntryCard` demotes URL/form autopilot to secondary | Orchestra path retained; dominant CTA is Create Your Business |
| Global Create launcher order changes | `create_store` featured and listed first | `create_with_ai` remains available in sheet |
| PIL `create_space` navigates to `/app` instead of `/space/create-business` | `actionCatalog` + host use `createStoreEntryRoute` | `/space/create-business` kept as route but demoted from PIL handoff |

## Impact scope

- **Dashboard:** `paths` consumers, nav builders, homepage header, explore registry, create launcher, My Stores / Catalog empty states, account menu, PIL navigation catalog
- **Not affected:** Core API, Mission 001 flags, intake clarification, video ownership, performer runtime dispatch logic

## Smallest safe patch

1. Delegate `createNewBusinessHref` / `BUSINESS_SETUP_HREF` to `createStoreEntryRoute({ source })`
2. Route explore `launcher_create` + `create_store` via `launchAction: 'navigate'` + canonical href
3. Feature `create_store` in Global Create registry; demote `create_with_ai` from featured
4. Homepage + PublicHeader primary CTA → `createStoreEntryRoute({ source })`
5. Fix My Stores / Catalog hardcoded partial URLs
6. Update affected unit tests only

**Proceed:** User confirmed "proceed" after Day 1 gate.
