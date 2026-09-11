# CARDBEY_CREATE_GROW_NAV_CONVERGENCE_REPORT

**Verdict:** `CREATE_GROW_NAV_CONVERGENCE_READY_WITH_LIMITATIONS`

Focused navigation/UX correction. Homepage, Performer, and HAS/WANT were not rebuilt.

---

## Canonical components found

| Concern | Canonical source |
|---|---|
| Desktop primary nav | `src/navigation/publicFrontNav.ts` (`getPublicFrontNav`) |
| Homepage chrome | `src/components/publicfeed/PublicFeedChrome.tsx` |
| Other public pages header | `src/components/layout/PublicHeader.tsx` (same nav helpers) |
| Desktop + Create | `GlobalCreateLauncher` `variant="header"` → `launchDesktopCreatePerformer` |
| Mobile Create FAB | `GlobalCreateLauncher` default `fab` + `PublicFeedMobileNav` |
| Mobile launcher UI | `CreateSheet` → `CreateSheetPanel` |
| Action catalog (kept) | `src/lib/createLauncher/createActionRegistry.ts` `DEFAULT_ACTIONS` |
| Intent routing | `src/lib/createLauncher/createIntentRouter.ts` |
| Performer entry | `launchPerformerMission` / `/app` (`RequireAuthOrGuest`) |
| Grow Your Business | `/grow-your-business` (`GrowYourBusinessPage`, `RequireAuth`) |

Desktop and mobile share one launcher component with responsive variants. Nav IDs live in one `PUBLIC_FRONT_NAV` list.

---

## Routes reused (no duplicates)

| Action | Route / entry |
|---|---|
| Desktop Create | Canonical Performer: `routeCreateAction('create_with_ai')` → `PERFORMER_MISSIONS.UNRESOLVED` → `/app` |
| Grow Your Business | `growYourBusinessPath()` → `/grow-your-business` |
| Create Your Business | `createStoreEntryRoute({ source: 'global_create_launcher' })` |
| Create Profile | `PERFORMER_MISSIONS.CREATE_PROFILE` via `routeCreateAction('create_profile')` |
| Discover / Explore (kept) | `/frontscreen` — not deleted |

Underlying tools still in registry (not top-level launcher):

- Add Product / Add Service / Create Website → Performer missions
- Create Promotion → `/campaigns/new`
- Create Digital Card → `/app/mi-greeting-cards`
- Discover templates → `/frontscreen`

---

## Files changed

- `src/navigation/publicFrontNav.ts`
- `src/components/publicfeed/PublicFeedChrome.tsx`
- `src/components/layout/PublicHeader.tsx`
- `src/components/createLauncher/GlobalCreateLauncher.tsx`
- `src/components/createLauncher/DesktopCreateHeaderButton.tsx` (new)
- `src/components/createLauncher/desktopCreateMode.ts` (new)
- `src/components/createLauncher/CreateSheet.tsx`
- `src/components/createLauncher/CreateSheetPanel.tsx` (new)
- `src/components/createLauncher/CreateActionCard.tsx`
- `src/lib/createLauncher/createActionRegistry.ts`
- `src/lib/createLauncher/createIntentRouter.ts`
- `src/lib/createLauncher/index.ts`
- `src/i18n/growYourBusinessResources.js`
- `src/i18n/publicFeedExploreResources.js`
- Tests listed below

---

## Desktop behaviour

**Before:** Marketplace · Cardbey Contents · + Create (opens large catalog dropdown) · Discover · For business · Create a Global Live

**After:** Marketplace · Cardbey Contents · + Create · Grow Your Business · …

- + Create goes **directly to Performer** (no catalog dropdown, no `aria-haspopup`).
- Grow Your Business sits **immediately next to Create**, not inside Create.
- Business Space **owner** header still uses + Post → `SpacePostSheet` (space posting, not the Create catalog).

---

## Mobile behaviour

**Before:** Create FAB opened a long sheet (business, profile, product, service, website, promotion, digital card, import, scan, upload, discover templates, …).

**After:** Create FAB opens a 3-choice launcher:

1. Create Your Business — AI-assisted storefront setup  
2. Grow Your Business — find customers, partners, and opportunities  
3. Create Profile  

Same UI for mobile web and installed/PWA (`PublicFeedMobileNav` + `GlobalCreateLauncher` FAB). Catalog tools remain inside Performer / existing routes.

---

## Discover handling

The homepage top-nav **Discover** item (`publicFeed.chrome.explore` → `/frontscreen`) was an extra discovery peer next to Create.

- **Removed** from `PUBLIC_FRONT_SECONDARY_NAV` (now empty).
- **Route preserved:** `/frontscreen`
- **Still reachable via:** footer `footer.exploreFrontscreen`, storefront header, `discover_templates` registry action, direct URL, living canvas stubs in `App.jsx`

Do not treat this as deleting discovery capability.

---

## Performer routing

Desktop Create uses the existing `create_with_ai` registry action:

- mission: `PERFORMER_MISSIONS.UNRESOLVED`
- source: `GLOBAL_CREATE`
- prefill: “Help me create something for my business”
- `autoSubmit: false` (unchanged governance)

`/app` remains behind `RequireAuthOrGuest` — anonymous Performer entry is preserved.

---

## Grow Your Business routing

- Label: **Grow Your Business** / **Phát triển doanh nghiệp** (`growYourBusiness.title`)
- Path: `/grow-your-business`
- Page: existing HAS/WANT user surface (`GrowYourBusinessView`)
- Auth: existing `RequireAuth` + login return-to (not weakened, no new auth system)
- Flag: `isGrowYourBusinessV1Enabled()` — fail-closed in production; nav item hidden when off
- Does **not** open Platform Admin Launchpad

---

## i18n keys

| Key | EN | VI |
|---|---|---|
| `growYourBusiness.title` (reused) | Grow Your Business | Phát triển doanh nghiệp |
| `growYourBusiness.launcherHint` (new) | Find customers, partners and business opportunities. | Tìm khách hàng, đối tác và cơ hội kinh doanh. |
| `growYourBusiness.subtitle` (unchanged) | Tell Cardbey what you have and what you're looking for. | … |
| `publicFeed.create.createProfile` | Create Profile | Tạo hồ sơ *(added; was missing in VI)* |
| `publicFeed.create.openCreate` | Open Create | Bắt đầu tạo |

No hardcoded chrome strings in the nav/launcher components.

---

## Tests

Targeted run (318 passed):

- `src/lib/createLauncher/createLauncher.test.ts`
- `src/components/createLauncher/CreateSheet.test.tsx` (hook-free `CreateSheetPanel`)
- `src/components/createLauncher/GlobalCreateLauncher.test.tsx` (hook-free header button + mode helper)
- `src/navigation/publicFrontNav.test.ts`
- `src/components/publicfeed/PublicFeedChrome.createGrowNav.test.tsx`
- `src/test/i18nContract.test.ts`

Coverage vs requested matrix:

1. Desktop Create does not open old dropdown — yes  
2. Desktop Create navigates to canonical Performer — yes (`launchDesktopCreatePerformer`)  
3. Desktop Grow Your Business visible next to Create — yes  
4. Grow routes to `/grow-your-business` — yes  
5. Discover top-nav removed — yes  
6. Mobile Create opens launcher — FAB still mounts `CreateSheet`; sheet contents tested via panel  
7. Exactly three launcher choices — yes  
8. Catalog tools absent from launcher — yes  
9. Underlying capabilities not deleted — yes (`DEFAULT_ACTIONS` still listed)  
10. EN/VI without mixed language — yes  
11. Responsive breakpoints — desktop header vs mobile FAB; full hooked `PublicFeedChrome` render not run in this environment (see limitations)

---

## Manual URLs to verify

Dashboard default: `http://localhost:5174`

1. `/` desktop → + Create → `/app` Performer (guest allowed). **No dropdown.**  
2. `/` desktop → Grow Your Business → `/grow-your-business` (login if needed, then return).  
3. `/` mobile viewport → Create FAB → three options only.  
4. Mobile: Create Your Business → store creation entry. Grow Your Business → HAS/WANT. Create Profile → Performer profile mission.  
5. `/frontscreen` still loads Explore.  
6. `/control-center/launchpad` still admin-only.

Live browser pass was **not** run here (no dashboard server / browser tools in this session).

---

## Unrelated failures (not repaired)

- Full hooked `PublicFeedChrome` / `CreateSheet` tests that import `react-i18next` + `react-router` can hit a **duplicate React** copy (`cardbey` react vs `cardbey-kimi-integration` react-dom). Existing `PublicFeedChrome.mobile.test.tsx` and `PublicHeaderLightTheme.test.tsx` fail the same way. Not fixed in this task.
- Core `pnpm test` Prisma `EPERM` on Windows `query-engine-windows.exe` (prior session). Not in this change set.

---

## Limitations

1. Grow Your Business nav/launcher entry is hidden when `ENABLE_GROW_YOUR_BUSINESS_V1` / `VITE_ENABLE_GROW_YOUR_BUSINESS_V1` is off (production fail-closed).  
2. Grow Your Business remains authenticated-only (`RequireAuth`).  
3. Hooked homepage chrome was not live-clicked in a browser in this session.  
4. PublicHeader Explore dropdown (food/products/services) is gone because secondary top-nav was emptied; `/frontscreen` remains.

---

## Impact note (development safety)

- Users who used the desktop Create dropdown for product/service/website/promotion/card now enter Performer instead. Capabilities were not deleted.  
- Users who used top-nav Discover lose that peer; Explore remains at `/frontscreen` and footer.

Smallest safe patch was used: one nav list, one Create launcher, one Performer helper, one Grow path.
