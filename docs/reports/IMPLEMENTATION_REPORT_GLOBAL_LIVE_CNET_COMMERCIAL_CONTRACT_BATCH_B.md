# IMPLEMENTATION REPORT — Global Live × Cnet commercial contract (Batch B)

Date: 2026-08-18  
ACK: `ACK GLOBAL_LIVE_CNET_COMMERCIAL_CONTRACT_BATCH_B`  
Worktree: `C:\Projects\cardbey-wt-live-cnet-contract`  
Branch: `feat/global-live-cnet-commercial-contract-a` (stacked on Batch A)  
Base: RTMPS v3 `355d54d16` (provider-confirmed `CONNECTING` until Cloudflare evidence)  
Status: **implemented in isolation** — not merged, not pushed, not deployed

This batch was **not** combined with the dirty WHIP/WHEP worktree.

---

## What landed

| Requirement | Implementation |
|-------------|----------------|
| Back-office campaign/placement controls | Owner APIs: list campaigns, activate/pause, assign, schedule (`PATCH`), withdraw (`withdrawnAt` only). Dashboard `LiveCnetCampaignPanel` on the existing Live Market owner page. |
| Eligible paired devices | `GET .../eligible-devices` returns display name, online, alreadyAssigned. No pairing codes, screenshots, or stream keys. `deviceId` is owner-assign only. |
| Schedule and withdraw | Placement `validFrom` / `validUntil` / `withdrawnAt`. No Device or Playlist row mutation. Overlay stays read-time. |
| Preview timed card + QR | `GET .../preview` returns live card copy, QR destination URL, playback mode, health, propagation=`next_playlist_fetch`. Does not claim LIVE. |
| Assignment health | `DEVICE_OFFLINE` (3 min heartbeat), `SCHEDULE_PENDING`, `SCHEDULE_EXPIRED`, `STREAM_UNAVAILABLE`, `WITHDRAWN`, campaign draft/paused. |
| Public/display manifest | `GET /api/public/live-cnet/manifest/:token` projects overlay fields. Does **not** write events. Does **not** apply device-offline health. |
| HLS with QR-card fallback | Overlay: LIVE without HLS URL → `live_card` + `STREAM_UNAVAILABLE`. webOS: HLS `VIDEO` error with `qrValue` → timed `LIVE_CARD` without failing the playlist item. |
| Idempotent telemetry | Impression per-minute; QR scan per-token/minute; public join/store-action prefer `Idempotency-Key` / body `idempotencyKey`. |
| Attribution linkage | Storefront still captures `glt` and posts join/store-action. Owner analytics include `attributedEventCount` / `unattributedEventCount`. |
| Separate owner analytics | `{ registrations, onlineViewers, screenPlays, qrScans, storeActions, neverCombined }` — no combined `viewers` field. |
| Authorization | Owner routes: flag + `requireAuth` + `requireStoreOwner`. Flag off → `LIVE_CNET_DISABLED`. |
| Privacy / responsive UI | Public refs and QR URL only in audience paths. Panel is stacked/grid on small screens. |

Flag: `ENABLE_LIVE_CNET_CONTRACT_V1` / `VITE_ENABLE_LIVE_CNET_CONTRACT_V1` default **false**, requires master + owner.

Start-intent stays **CONNECTING**. This batch does not change Go Live / RTMPS lifecycle.

---

## Isolation guarantees

- Dirty monorepo `C:\Projects\cardbey` was not patched for Live Market / Cloudflare / WHIP.
- No Render apply, no Cloudflare API calls, no OBS, no staging merge, no production flags.
- No billing, ad buy, unique-people claims, or combined viewer totals.

---

## Tests run (worktree only)

| Suite | Result |
|-------|--------|
| Core `test:live-cnet` (domain, service, operator, routes) | 23 passed |
| Core `test:live-market` (includes `rtmpsLifecycle.test.js`) | 87 passed |
| `@cardbey/display-runtime` | 50 passed |
| `@cardbey/display-webos` (includes HLS → timed QR card fallback) | 38 passed |
| Dashboard liveCnet attribution + flags + panel + StoreLiveMarketPage | 47 passed |

No Cloudflare, Render, OBS, or device calls.

---

## Not in this batch (Batch C)

Render/pilot deployment, physical-screen rehearsal, real Cloudflare or OBS validation, production flags.

Stop here until `ACK GLOBAL_LIVE_CNET_COMMERCIAL_CONTRACT_BATCH_C`.
