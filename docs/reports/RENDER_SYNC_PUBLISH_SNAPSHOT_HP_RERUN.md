# RENDER SYNC — PUBLISH_SNAPSHOT_V1 + HP Publish Re-run

**Date:** 2026-09-04  
**Mission:** Sync live staging env after Wave 0 pins; re-prove HP publish

---

## What was synced (Render live)

| Service | ID | Env set | Deploy |
|---------|-----|---------|--------|
| `cardbey-core-staging` | `srv-d7abtuhr0fns738dj3jg` | `PUBLISH_SNAPSHOT_V1=true` + research/Mission001/grounded pins | `dep-dactlkajnfac738r67c0` → **live** |
| `cardbey-dashboard-staging` | `srv-d7a9ejmdqaus73epho4g` | `VITE_PUBLISH_SNAPSHOT_V1=true` | `dep-dactokgae00c73drp890` → **live** |

Blueprint PR to staging branch: [#343](https://github.com/DanPCB/cardbey/pull/343) (merged).  
Ops script: `scripts/sync-render-publish-snapshot.mjs`

**Production** (`cardbey-core` / `srv-d4g3mceuk2gs738qk0c0`) was **not** mutated in this pass (staging-first).

---

## HP publish re-run (after sync)

| Check | Result |
|-------|--------|
| Snapshot API enabled | **PASS** (no longer `publish_snapshot_disabled`) |
| `POST …/draft-store/:id/publish` | **PASS** HTTP 200, returns slug + liveUrl |
| Owner GET store | **PASS** (`isActive=true`, `publishedAt` set) |
| `GET /api/public/stores/:slug` | **FAIL 404** |

### Root cause (public 404)

`isAbandonedGuestOwnedBusiness()` in `apps/core/cardbey-core/src/utils/publicStoreVisibility.js` excludes any Business whose `userId` starts with `guest_`. Guest canary publish therefore cannot appear on public `/s/:slug` by design.

Earlier canary `liveOk=true` was a **false positive** (static dashboard SPA always returns HTTP 200). Canary now checks public API.

### Honest W1.1 verdict after sync

`PASS_PUBLISH_API_PUBLIC_GUEST_BLOCKED`

Meaning:

- Wave 0 pin goal achieved on staging  
- Publish path works for guest JWT  
- **Public live store still requires non-guest ownership** (signup/claim) for READY

---

## Next

1. HP public canary with claimed/authenticated (non-`guest_*`) owner — or document guest publish as owner-preview-only.  
2. Optionally sync same pins to production Core + dashboard.  
3. Continue Wave 1.2 ambiguous clarify / Wave 2.
