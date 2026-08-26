# Mobile Business Space — Post Nav V1

**Verdict:** `MOBILE_SPACE_POSTING_V1_PARTIAL` (shell ready; publish API implemented — browser round-trip pending proof)  
**Date:** 2026-08-27 (Phase 2 publish)  
**Impact:** `docs/reports/IMPACT_REPORT_MOBILE_BUSINESS_SPACE_POST_NAV_V1.md`, `docs/reports/IMPACT_REPORT_MOBILE_SPACE_POSTING_PHASE2.md`  
**Projection:** `docs/SPACE_POST_GLOBAL_PROJECTION_V1.md`

---

## Old → new navigation mapping

| Context | Old | New |
|---------|-----|-----|
| Global `/` | Home · Library · Create · Assistant · Me | **Unchanged** |
| Business Space (mobile) | Home · Library · Create · Assistant · Me (via theatre shell) | Home · **Shows** · **Post** · Assistant · Me |
| Personal Space (mobile) | No bottom nav | Home · Shows · Post · Assistant · Me |

| Action | Business Space | Personal Space | Global |
|--------|----------------|----------------|--------|
| HOME | `/space/:id` (Content/theatre) | `/space/personal` | `/` |
| SHOWS | `/space/:id?tab=shows` (`businessShows`) | `/space/personal?tab=shows` | `/library` (Universal Library) |
| POST | SpacePostSheet (owner) / Global Create (visitor) | SpacePostSheet | CreateSheet |
| ASSISTANT | Performer + BusinessSpaceContext | Performer + personal context | Orb chat |
| ME | `/space/personal` (full Personal Space) | `/space/personal` | `/me` hub (+ CTA to Personal Space) |

Desktop Business Space left-rail / theatre chrome is unchanged aside from Shows tab staying in-Space when selected (no forced Global `focus=shows` exit).

---

## Active Space context model

`resolveActiveSpaceContext(pathname)` → `{ type: personal|business|none, spaceId, storeId, businessId, inSpaceShell }`.

`resolveMobileSpaceDestination(activeSpace, action)` centralizes bottom-nav hrefs.

---

## Post flow

1. Owner taps **Post** FAB  
2. `SpacePostSheet` lists capability-filtered actions (no Create Business / Create Store)  
3. **Update** / **Photo·Video** → `SpacePostComposePanel` → `POST /api/stores/:storeId/space-updates`  
4. Authoritative row: `StoreActivityEvent` `SPACE_UPDATE` (`public_lifecycle`)  
5. Space Content projects via `recentActivity` + activity adapter  
6. `GLOBAL_ELIGIBLE` → `bumpPublicFeedRankForStore` (store-card Global; not a second post row)  
7. Create with Performer / Product / Service / Live / Show → governed Performer (`autoSubmit: false`) or navigate  
8. Promotion → existing `/campaigns/new`

**No new `SpacePost` table.** See `docs/SPACE_POST_GLOBAL_PROJECTION_V1.md`.

---

## Shows ownership semantics

- Mobile Space **Shows** = entity-owned media (`?tab=shows`), **not** Universal Library.  
- Global Library remains `/library`.  
- Theatre Home (`activeTab=content`) keeps PublicFeedShell; other tabs use classic Space panels so Shows grid can render.  
- Media Space posts may attach a Show work referencing the same `mediaUrl`.

---

## Global distribution semantics

| Intent | Behavior |
|--------|----------|
| `SPACE_ONLY` | Space feed only |
| `GLOBAL_ELIGIBLE` | Space feed + public feed rank bump for the business |

Vocabulary reuses lifecycle + explicit distribution metadata (not every BusinessEvent).

Personal Space posts are **not** forced into Global (Global is store-oriented today).

---

## Performer context

Assistant + Post → Performer receive `surfaceContext` with `spaceType`, `businessId` / `storeId` / `spaceId`, `personalId` when personal, `publishIntent`, route, capabilities (ids, not full business blobs).

---

## Personal Profile changes

- Space **Me** → `/space/personal` (full Space shell with Content / Connections / Businesses / Shows / About).  
- Global `/me` hub gains primary CTA “Open my Personal Space”.  
- Personal SpaceShell now mounts mobile bottom nav (safe-area inset).  
- Personal Update/Photo labeled **via Performer · not Global yet**.

---

## Permission model

- Business Post sheet only when `storeId ∈ user.stores`.  
- Publish API enforces owner (or platform admin).  
- Visitors tapping Post on Business Space open **Global CreateSheet** (generic Cardbey create), not business publish.  
- Personal Post requires signed-in user as owner of personal Space.

---

## Routes / files reused

| File | Role |
|------|------|
| `activeSpaceContext.ts` | Context |
| `resolveMobileSpaceDestination.ts` | Destinations |
| `spacePostActionRegistry.ts` | Post actions |
| `routeSpacePostAction.ts` | Handoff |
| `SpacePostSheet.tsx` / `SpacePostComposePanel.tsx` | UI |
| `publishSpaceUpdate.ts` | Dashboard client |
| Core `publishSpaceUpdate.js` + `spacePostRoutes.js` | API |
| `PublicFeedMobileNav.tsx` | Labels + routing |
| `GlobalCreateLauncher.tsx` | Post vs Create |
| `SpaceShell.tsx` | Mobile nav mount |
| `SpacePage.tsx` | Theatre only on Content tab |
| `MeHubPage.tsx` | Personal Space CTA |
| `resolveSpaceData.ts` | Merges public `recentActivity` into Space resolve |

---

## Backend capability gaps (remaining)

1. Live browser matrix + full BUSINESS→FEED→GLOBAL→SPACE proof on staging  
2. True Global **post cards** (vs store-card rank bump) if product requires them  
3. Personal Space authoritative publish + policy for person Global  
4. Poll / Event post types (omitted)

---

## Tests

- Unit: `mobileSpacePostNav.v1.test.ts`, Core `publishSpaceUpdate.test.js`, activity adapter SPACE_UPDATE  
- **Browser E2E:** required for `MOBILE_SPACE_POSTING_V1_READY` — run at 390×844 / 412×915 / 430×932

---

## Acceptance checklist

| Gate | Status |
|------|--------|
| Business Space bottom nav Home/Shows/Post/Assistant/Me | Code ready |
| Create → Post label in Space | Code ready |
| Post sheet replaces Create Business/Store | Code ready |
| Update / Photo publish as business | Code ready (API + compose) |
| Post appears in Business Space feed | Code ready (resolve + adapter) |
| Global-eligible projection | Code ready (rank bump; store-card) |
| Shows media reference | Code ready (optional attach) |
| Assistant + Space context | Code ready |
| Me → Personal Space | Code ready |
| Owner permissions | Code ready (API + sheet) |
| Global Create/Library unchanged | Code ready |
| Live browser proof | **Pending** |
