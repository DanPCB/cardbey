# SPACE PROFILE FOUNDATION V1

**Verdict:** `SPACE_PROFILE_FOUNDATION_V1_READY`  
**Date:** 2026-08-25  
**Surfaces:** Personal Space + Business Space only (`/space/:spaceId`)  
**Frozen:** Global Marketplace / LivingCanvas front page

---

## Current-state audit (pre-change)

| Item | Finding |
|------|---------|
| Route | Single public `/space/:spaceId` (`personal` / `me` / store id) |
| Shell | None — immersive `SpaceHero` + placeholder cards |
| Placeholder copy | “Placeholder modules for Products / Slideshows / Campaigns (foundation only).” |
| Catalog / Shows / Live / Social | Not wired into Space body |
| Data resolve | Already: `resolveBusinessSpaceData`, `resolvePersonalSpaceData`, adapters |
| Owner vs visitor | Partial (edit menu only) |

---

## Routes / components reused

- `SpacePage` → `SpaceShell` + `SpaceIdentityHeader`
- `SpaceSwitcher`, `PublicActionRail`, `PublicShareSheet`, `SpaceQrModal`
- `getVisibleSocialLinks` + `ProfileSocialLinks` → `ConnectedPresence` (LINKED only)
- `projectSpaceOfferings` from store preview/catalog
- `projectSpaceShows` via `resolveFeaturedWorks` **without** inventing product fallbacks
- Live: soft `GET /api/public/live-market/stores/:slug/live-session` (empty when gated/missing)
- Performer: existing `launchPerformerEntrypoint`
- Store CTA: existing `primaryCtaUrl` / `resolveStorePublicUrl` → `/s/:slug`

---

## SpaceShell structure

```
SpaceShell
├── SpaceIdentityHeader (compact cover ~220–360px)
│   ├── Marketplace back link
│   ├── Owner menu / SpaceSwitcher
│   ├── Avatar + name + category/location + tagline
│   ├── Primary CTA + Share/Call
│   ├── ConnectedPresence (optional strip)
│   └── PublicActionRail + QR
├── SpaceTabs
├── main content (active tab)
└── optional desktop context rail (Content tab)
```

---

## Business Space

**Tabs:** Content (default) · Services|Menu|Shop · Live · Shows · About  

**Content:** feed projected from business update, live, shows, offerings — truthful empty state.  
**Services:** compact offering preview → Visit store.  
**Live:** public live-session projection or empty.  
**Shows:** grounded featured works only (no truck/catalog invent).  
**About:** grounded description + contact fields + links.

## Personal Space

**Tabs:** Content · Connections · Shows · About · (Businesses if owner has stores)  

**Connections:** non-fake empty bridge for future relationship data.  
**Shows:** empty until personal shows exist.

---

## Owner / visitor

| | Visitor | Owner |
|--|---------|-------|
| Follow/Connect | Not fabricated (no fake buttons) | Same |
| Edit profile | Hidden | Owner menu → business profile |
| Ask Performer | Via rail | Rail + owner shortcuts |
| Visit store / Open profile | Primary CTA | Same |

---

## Store / Live / Shows relationship

- **Store** remains canonical commercial destination (`/s/:slug`).
- **Space** is identity + activity projection.
- **Live / Shows** are read-only projections of existing objects — no new engines.

---

## Connected Presence

V1 labels all external links as **Linked**. Never displays **Connected** without an authorized integration (none in this phase).

---

## Mobile

- Single column; compact header; horizontally scrollable tabs; no desktop context rail on small screens.

---

## Tests

- `src/lib/space/spaceProfileFoundation.test.ts`
- `src/components/space/SpaceIdentityHeader.test.tsx`
- Existing `SpaceHero.test.tsx` still green

---

## Known limitations

1. Live Market dashboard client package is not on dashboard `main`; Space uses a soft public API client and fails closed to empty.
2. No Follow/Connect persistence yet — Connections tab is a truthful empty bridge.
3. Content feed is a **projection**, not a new activity graph or composer.
4. Existing published spaces do not need migration; UI reads current APIs.
5. Screenshots: verify manually on `/space/personal` and a real business space (e.g. AWE) after deploy.

---

## Follow-on: Contact / Relationship

Plug into `Connections` tab without redesigning SpaceShell:

- Load follows/relationships when API exists.
- Keep empty state until then.
- Do not import device contacts in this foundation.

---

## Checklist

- [x] Global front page unchanged
- [x] Shared SpaceShell
- [x] Compact identity header
- [x] Business Content default tab
- [x] Business Services preview
- [x] Existing Live projection (soft)
- [x] Existing Shows projection
- [x] Grounded About info
- [x] Personal Profile same visual grammar
- [x] Mobile responsive structure
- [x] No internal placeholder copy
- [x] No unrelated/fake content invent for Shows
- [x] No parallel Store/Performer/Live system
- [x] Commercial Store remains canonical
