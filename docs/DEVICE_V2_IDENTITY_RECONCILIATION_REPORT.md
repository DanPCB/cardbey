# Device V2 Identity & Ownership Reconciliation — Delivery Report

**Date:** 2026-07-15  
**Impact report:** `docs/IMPACT_REPORT_device_v2_identity_reconciliation.md`

---

## Confirmed root cause

1. TV `request-pairing` omitted `deviceId`, so Core often minted a **new** `Device` cuid/UUID per Reset / abandoned pair / reinstall.
2. There was **no stable `installationId`**; physical identity collapsed into mutable `Device.id`.
3. Heartbeat upserted by `deviceId` only and could create orphans; list is **store+tenant scoped**, so an active orphan (`temp/temp` or other store) is invisible for the selected store.
4. Dashboard **`unpairDevice` was a stub** while Core already supported soft-unpair — operators Reset the app instead → more duplicates.
5. Same-account **store reassignment did not exist** (only unpair + reclaim).

### Why `68035bd2-…` is absent from the dashboard

The TV is heartbeating under that id, but the Devices page lists **only devices for the selected tenant+store**. Likely causes (one or more):

- Row is still `temp/temp` (never claimed into the selected store), or  
- Row is owned by a different account/store than the one currently selected, or  
- Dashboard is looking at the historical store rows (`6673…` / `c84f…`) while the live id is not among them.

After this fix: heartbeat returns/reconciles the **canonical** id; once claimed to the selected store (or reassigned), that same id becomes `online` in that account’s device list.

### Why `6673…` and `c84f…` remain offline

They are **stale duplicate device records** from prior pairing/reset cycles. They no longer receive heartbeats because the TV’s local prefs now point at `68035…`. They are not separate physical TVs. Use `GET /api/device/duplicates?tenantId=…` then `POST /api/device/duplicates/archive` (same-account) to soft-archive them after confirming the live id is canonical.

---

## Identity model (before → after)

| Concept | Before | After |
|---------|--------|-------|
| Physical id | Implicit `Device.id` (recreated) | `installationId` (stable prefs + DB/capabilities) |
| Device record | Same as physical | `Device.id` (= deviceRecordId) |
| Ownership | `tenantId` + `storeId` | Same; mutable via reassign / release+claim |
| Claimable | ad-hoc `temp` | `CLAIMABLE` + pairing code after release |
| Store move | Unpair + new pair | `POST …/reassign-store` on same record |

---

## Flows

### Same-account store reassignment

Dashboard card → **Move to {store}** → `POST /api/device/:id/reassign-store`  
→ clear previous playlist bindings → `storeId = newStoreId` → optional playlist → SSE → TV heartbeats see new `storeId` and playlist poll refreshes. **No new pairing code. No new device row.**

### Cross-account release / claim

Account A → **Release Device** → soft-unpair → `temp/temp` + pairing code + `CLAIMABLE` + audit (`releasedBy/At`, `previousAccountId/StoreId`) → `returnHome`  
Account B → claim with code → same `Device.id` / installation → `DEVICE_CLAIMED` audit (`claimedBy/At`, new account/store).  
No silent transfer; claimer does not see prior account private details.

---

## Files changed (primary)

**Android:** `AppConfig.kt`, `PairTvActivity.kt`, `DeviceHeartbeatManager.kt`, `PlaylistEngine.kt`, `PlayerActivity.kt`  
**Core:** `schema.prisma` (`installationId`), `deviceIdentity.js`, `requestPairing.js`, `deviceRequestPairingBridge.js`, `deviceUnpairService.js`, `deviceReassignService.js`, `completePairing.js`, `deviceEngine.js` (heartbeat, reassign, duplicates)  
**Dashboard:** `deviceClient.ts`, `appSignOut.ts`, `devicePresence.ts`, `ScreenDeviceCard.tsx`, `GenericDeviceCard.tsx`, `DevicesPageTable.tsx`  
**Docs:** impact + this report  
**Tests:** `deviceIdentity.test.js`, `deviceReassignService.test.js`, updated `deviceUnpairService.test.js`

---

## Schema / deploy

- Prisma: `Device.installationId String? @unique`  
- Run on Core DB: `npx prisma db push` (or migrate) then regenerate client.  
- Until pushed, code dual-writes `installationId` into `DeviceCapability.capabilities` and degrades column writes gracefully.

---

## Diagnostics

Structured logs: `DEVICE_ID_RESTORED`, `DEVICE_REGISTERED`, `DEVICE_RECORD_MATCHED`, `DEVICE_RECORD_CREATED`, `HEARTBEAT_ACCEPTED`, `HEARTBEAT_OWNER_MISMATCH`, `ACCOUNT_CONTEXT_CHANGED`, `DEVICE_REASSIGN_*`, `DEVICE_RELEASED`, `DEVICE_CLAIMED`, `DUPLICATE_DEVICE_*`, `PLAYLIST_ASSIGNMENT_UPDATED`.

TV overlay: device record id, installation hash, pairing status, owner attached, store id, playlist assignment, heartbeat accepted/code, last playlist fetch.

---

## Tests run

```
vitest: deviceUnpairService, deviceReassignService, deviceIdentity, deviceListDuplicateMarking
→ 4 files, 14 tests passed
```

Physical Tests A–J: unit coverage for identity restore, reassign, cross-account block, release→CLAIMABLE, duplicates report shape. End-to-end on the JVC TV still required after deploy + app update + `prisma db push`.

---

## Deploy / verify checklist (physical workflow)

1. Deploy Core + `prisma db push`  
2. Install updated Android APK on the JVC  
3. Confirm overlay: same `deviceRecordId` after power cycle (Test A)  
4. Account A: Move store 1 → 2; confirm same id, Store 2 playlist (Test B)  
5. Release from A → TV shows claim code (Test D)  
6. Claim from B → same installation, B playlist (Test E/F)  
7. Sign out A / in B: no stale store device list (Test G)  
8. Archive `6673…` / `c84f…` via duplicates API if same account (Test I)

**Fix is not “complete” for the living room TV until that physical path is exercised post-deploy.**
