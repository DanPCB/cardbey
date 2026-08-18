# IMPLEMENTATION REPORT — Global Live × Cnet commercial contract (Batch A)

Date: 2026-08-17  
ACK: `ACK GLOBAL_LIVE_CNET_COMMERCIAL_CONTRACT_BATCH_A`  
Worktree: `C:\Projects\cardbey-wt-live-cnet-contract`  
Branch: `feat/global-live-cnet-commercial-contract-a`  
Base: RTMPS v3 `355d54d16` (provider-confirmed `CONNECTING` until Cloudflare evidence)  
Status: **implemented in isolation** — not merged, not pushed, not deployed

This batch was **not** combined with the dirty WHIP/WHEP worktree.

---

## What landed

| Requirement | Implementation |
|-------------|----------------|
| One canonical Global Live session | Existing `LiveMarketSession`. One `GlobalLiveCnetCampaign` per session (`liveSessionId` unique). |
| Cnet campaign linked to session + store | `createCampaign` binds `liveSessionId` + `storeSlug`. Public refs `glc_` / `gls_`. |
| Device/placement assignments + schedules | `GlobalLiveCnetPlacement` with `validFrom`/`validUntil`, `glp_` / `gld_` / `glt_`. |
| Cnet live HLS, not IMAGE | Overlay `type: live_hls` when session is `LIVE` with public HLS URL. Display `inferType` maps `live_hls` / `.m3u8` → **VIDEO**. |
| Session QR / deep link | Core `GET /api/public/live-cnet/h/:token` → 302 `/s/:slug?glc=&glp=&gld=&glt=#live`. No `deviceId` / `sessionId` / `storeId`. |
| Event chain | Screen impression (playlist overlay, per-minute dedupe) → QR scan (handoff) → registration (optional token) → online join / store action (public POST). |
| Truthful lifecycle | Unchanged RTMPS path: start stays **CONNECTING**; **LIVE** only from provider evidence. |
| Separate metrics | `screenPlays`, `qrScans`, `registrations`, `onlineJoins`, `storeActions` — never summed as viewers. |
| Dedicated pilot services | `render-global-live-pilot.yaml` — new names, branch of this batch, `autoDeploy: false`. `render.yaml` staging/main untouched. |

Flag: `ENABLE_LIVE_CNET_CONTRACT_V1` default **false**, requires `ENABLE_LIVE_MARKET_V1`.

---

## Playback truth

- LIVE + customer-code HLS URL → playlist item `live_hls` (normalized to VIDEO, MIME `application/vnd.apple.mpegurl`).
- Otherwise → `LIVE_CARD` (timed card + QR), not an image misread of HLS.
- webOS skips HTTP HEAD/GET probe for HLS and `LIVE_CARD`.
- HLS `<video>` uses `source type=application/vnd.apple.mpegurl`. QR stays on the corner.

---

## Isolation guarantees

- Dirty monorepo `C:\Projects\cardbey` was not patched for Live Market / Cloudflare / WHIP.
- Existing RTMPS worktrees were not reused.
- No Render apply, no Cloudflare API calls, no OBS, no staging merge.

---

## Tests run (worktree only)

| Suite | Result |
|-------|--------|
| Core `test:live-cnet` | 11 passed |
| Core `test:live-market` (includes `rtmpsLifecycle.test.js`) | 87 passed after snapshot includes `cnetContractV1: false` |
| `@cardbey/display-runtime` | 50 passed (HLS `.m3u8` → VIDEO, not IMAGE) |
| `@cardbey/display-webos` | 37 passed (HLS/LIVE_CARD skip HTTP probe) |
| Dashboard `src/lib/liveCnet/attribution.test.ts` | 5 passed (separate from EOI storage) |

No Cloudflare, Render, OBS, or device calls.

---

## Not in this batch

Owner dashboard campaign UI, physical TV flash, WHIP/WHEP, staging/production deploy, recording/replay, chat/SMS/translation, combining registration + screen plays + online joins into a viewer count.

Stop here until a new ACK.
