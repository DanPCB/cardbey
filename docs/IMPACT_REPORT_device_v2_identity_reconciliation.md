# Impact Report: Device V2 Identity & Ownership Reconciliation

**Date:** 2026-07-15  
**Status:** Proceeding under explicit user mandate to audit and fix  
**Scope:** Device V2 physical identity, store reassignment, cross-account release/claim, dashboard scoping

---

## Confirmed root cause (audit)

Physical identity is collapsed into a server `Device.id` that is often **recreated** when the TV requests pairing **without** sending its existing `deviceId`. There is no stable `installationId`. Ownership (`tenantId`/`storeId`) lives on the same row and store moves require unpair+reclaim (and dashboard unpair is stubbed).

### Why TV `68035bd2-…` is absent from the dashboard

1. Device list is scoped to **selected store + tenant**; a row at `temp/temp`, another store, or another tenant never appears in the selected store list.
2. Heartbeat upserts by `deviceId` only and can **create** a new row if that id is unknown — so an active TV can heartbeating under an id that never completed claim into the current account/store.
3. Dashboard unpair client is a **stub** (`unpairDevice` throws), so release/reclaim from the UI does not recycle the existing row; operators reset the app → new pairing create → orphaned old rows.

### Why `6673fa7f-…` and `c84ff875-…` stay offline

They are almost certainly **stale duplicate Device rows** for the same physical TV (prior pairing/reset/heartbeat creates). They no longer receive heartbeats because the TV’s local prefs now point at `68035…` (or another id). Duplicate marking exists but is weak (model/platform fingerprint) and dashboard does not treat `duplicate_stale` as trusted.

---

## What could break

| Risk | Why | Impact |
|------|-----|--------|
| Pairing flow rejects or loops | TV always sends `deviceId`/`installationId`; already-paired path returns `alreadyPaired` | Pairing / first-time claim |
| Heartbeat creates fewer orphans | Create-on-missing gated when `installationId` maps to existing/archived row | Presence, playlist pull |
| Unpair issues claimable code | Soft-unpair becomes CLAIMABLE + pairing code; TV must clear local ownership | Unpair, re-pair, cross-account claim |
| Store reassignment mutates row | New endpoint changes `storeId` + playlist bindings without new pairing | Playlist, list filters, SSE |
| Sign-out clears device caches | Invalidates `devices` / unpaired / canonical store | Devices page after account switch |
| Schema adds `installationId` | Requires `prisma db push` / migrate on Core DB | Deployments without schema update degrade to capability JSON fallback |

---

## Impact scope

- Android TV app (`com.cardbey.slide`): AppConfig, pairing, heartbeat, player diagnostics, returnHome
- Core: request-pairing, heartbeat, unpair/release, store reassign, duplicate report/archive, Device schema
- Dashboard: `deviceClient` unpair/reassign, Devices page scoping, sign-out/cache clear, presence tiers, optional reassign UI

---

## Smallest safe patch (ordered)

1. **Stable installation identity** on TV (never cleared on unpair/store switch); always send on pair/heartbeat.
2. **Backend reconcile by `installationId` (+ existing deviceId)**; do not mint a new row when installation matches.
3. **Same-account store reassign** endpoint updating the existing row + playlist bindings.
4. **Release → CLAIMABLE** (preserve installation / device id) + claim attaches new owner/store; audit fields in metadata/logs.
5. **Wire dashboard unpair**; clear store/device query state on account sign-out; trust `duplicate_stale`; admin duplicate report + safe archive.
6. **Diagnostics** (structured logs + TV overlay fields) and **tests A–J** (unit/integration where runnable).

**Security invariants (unchanged):** no silent cross-account transfer; claim requires explicit release + code; heartbeat cannot move paired ownership.

---

## Identity model

| Concept | Before | After |
|---------|--------|-------|
| Physical identity | Implicit `Device.id` (recreated often) | `installationId` (stable) + `Device.id` (record) |
| Ownership | `tenantId` + `storeId` on same row | Same, but mutable via reassign / release+claim |
| Claimable | `temp`/`temp`, pairingCode ad hoc | Explicit `CLAIMABLE` + pairing code after release |
| Store move | Unpair + new pair (often new id) | Reassign on same record (same account) |

---

## Acknowledgement

User requested full audit **and** fix of the physical workflow (A→B store switch, release, claim). Implementation follows this report.
