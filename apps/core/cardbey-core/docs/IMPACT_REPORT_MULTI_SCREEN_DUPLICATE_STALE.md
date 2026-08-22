# Impact Report: Multi-screen store wrongly marked "Duplicate (stale)"

**Date:** 2026-07-28  
**Status:** Fix proposed / implementing (user requested fix)  
**Scope:** Device list presence projection only (minimal)

## Observed

- One store/space ("French Baguette Cafe") correctly lists multiple screens (`lg-nano`, `lg-02`).
- `lg-02` is labeled **Duplicate (stale)** and forced offline in the list API, despite a recent heartbeat (UI showed ~3s ago).
- Product expectation: **one store may have many screens**.

## Root cause (code)

`GET /api/device/list` calls `markDuplicateDevicesInList` (`src/lib/deviceListDuplicateMarking.js`).

Fingerprint today:

`dup|tenantId|storeId|type|platform|model`

Two distinct webOS screens at the same store with the same/empty model share that fingerprint. The lower-scoring row gets:

- `presenceTier = 'duplicate_stale'`
- `isOnline = false` / `status = 'offline'`

This does **not** require a shared `installationId`. Admin `GET /api/device/duplicates` already treats weak fingerprint as unsafe (`safeMergeEligible: false`) and only uses it when all members lack `installationId`. List marking does not follow that rule.

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| Second (Nth) screen at a store shown as Duplicate (stale) / offline | Weak fingerprint = same store + similar hardware | Devices list, playlist assign UX, presence badges |
| True re-pair orphans no longer auto-labeled on list | After fix, only shared `installationId` demotes | Orphan hygiene; admin duplicates report still available |
| Cleanup-stale soft-archiving second TV | Same weak fingerprint used for archive | Mitigated in this patch (`installationId`-only) |

## Impact scope

- **Affected:** Core device list projection; dashboard presence badge for `duplicate_stale`.
- **Not affected:** Pairing, heartbeats, playlist assign APIs, store/space model (multi-device per `storeId` already allowed).
- **Data model:** Unchanged. Multi-screen per store remains N `Device` rows with one `storeId`.

## Smallest safe patch

1. Pass `installationId` (column or capability JSON) into list-formatted rows.
2. Change `markDuplicateDevicesInList` to demote losers **only** when ≥2 rows share the same non-empty `installationId`.
3. Do **not** demote on weak model/platform fingerprint (keeps multi-screen stores correct).
4. Update unit tests accordingly.
5. Align `deviceCleanupService` duplicate soft-archive with the same `installationId`-only rule (avoids cleanup wiping a second TV).

## Confidence

- **Observed:** Weak list fingerprint and demotion behavior in code; screenshot shows two distinct named screens, one labeled Duplicate (stale).
- **Assumed:** `lg-nano` and `lg-02` are two physical TVs (not verified against DB `installationId` in this session). Even if one is an orphan, demoting by weak fingerprint still breaks legitimate multi-screen stores.
