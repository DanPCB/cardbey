# IMPACT REPORT — Global Live × Cnet commercial contract (Batch A)

Date: 2026-08-17  
ACK: `ACK GLOBAL_LIVE_CNET_COMMERCIAL_CONTRACT_BATCH_A`  
Status: **PROCEED** on an isolated RTMPS worktree — not the dirty WHIP/WHEP tree  
Base: `feat/cloudflare-stream-rtmps-pilot-v3` (`355d54d16`) — provider-confirmed `CONNECTING`→`LIVE`

---

## Isolation (mandatory)

| Tree | Action |
|------|--------|
| `C:\Projects\cardbey` dirty WHIP/WHEP + BI/EOI | **Do not modify Live Market / Cloudflare files** |
| New worktree from RTMPS v3 | All contract code lives here |

This batch does **not** merge WHIP `go-live → LIVE`. It reuses RTMPS start-intent `CONNECTING` until Cloudflare evidence.

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Device `playlist/full` shape change breaks Android / existing TVs | **High** |
| HLS `.m3u8` still classified as IMAGE → live never plays | High (this batch fixes it; regression if inferType is too broad) |
| Injecting live items into every playlist when flag on | High — must be assignment-gated |
| Prisma models / migrations applied on staging/production | **High** — dedicated pilot only; flags default OFF |
| QR URLs leak internal `deviceId` / session cuid / stream keys | **Critical** |
| Mixing registration counts into “viewers” | Product-truth |
| `render.yaml` staging auto-deploy of this branch | **Critical** — use a **separate** blueprint, `autoDeploy: false` |
| Touching Business/Device graphs or signage save paths | Medium |
| Registration API rejecting unknown `attributionToken` | Medium — token must be optional |

---

## (2) Why

Cnet today has no Global Live session, campaign, placement, or public-ref QR. Display `inferType` treats `.m3u8` as IMAGE. RTMPS already builds public HLS URLs (`publicPlayback.js`) but devices never receive them.

---

## (3) Impact scope

**In scope:** new `liveCnet` module; additive Prisma tables; flag-gated playlist overlay; display HLS/LIVE_CARD types; optional registration token; public handoff; metrics; dashboard query capture; isolated Render **spec** file.

**Out of scope:** WHIP/WHEP, staging merge, Render apply, Cloudflare calls, OBS, physical TV flash, performance fees, recording/replay, chat/SMS/translation.

---

## (4) Smallest safe patch

1. Flag `ENABLE_LIVE_CNET_CONTRACT_V1` default **false** (requires Live Market master).
2. New tables only: `GlobalLiveCnetCampaign`, `GlobalLiveCnetPlacement`, `GlobalLiveCnetEvent`. One campaign per session. Public refs only in QR.
3. `playlist/full`: **prepend** overlay items only when flag on **and** device has an active placement. Existing items unchanged. Try/catch no-throw.
4. Display: `.m3u8` / `live_hls` → **VIDEO**; skip HTTP probe for HLS; `LIVE_CARD` fallback with QR (not an image misclassification of HLS).
5. Public `GET /live/h/:token` records `LIVE_CNET_QR_SCAN` and redirects to `/s/:slug#live` with public query params (no internal ids).
6. Metrics return **separate** counters: `screenPlays`, `qrScans`, `registrations`, `onlineJoins`, `storeActions`. Never summed as viewers.
7. `render-global-live-pilot.yaml` — new service names, not `staging`/`main`, `autoDeploy: false`. Do not edit live `render.yaml` services.

No Cloudflare provider calls. No staging deploy.
