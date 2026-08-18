# IMPACT REPORT — Global Live × Cnet commercial contract (Batch B)

Date: 2026-08-18  
ACK: `ACK GLOBAL_LIVE_CNET_COMMERCIAL_CONTRACT_BATCH_B`  
Status: **PROCEED** on the isolated RTMPS worktree — not the dirty WHIP/WHEP tree  
Worktree: `C:\Projects\cardbey-wt-live-cnet-contract`  
Branch: `feat/global-live-cnet-commercial-contract-a` (Batch B stacked on Batch A)

---

## Isolation (mandatory)

| Tree | Action |
|------|--------|
| `C:\Projects\cardbey` dirty WHIP/WHEP | **Do not modify** Live Market / Cloudflare / WHIP files |
| Isolated contract worktree | All Batch B code lives here |

Owner **Go Live / start-intent must remain CONNECTING**. Batch B does not change session lifecycle.

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Owner Live Market page grows a new panel that runs when the contract flag is off | Medium — gate on `ENABLE_LIVE_CNET_CONTRACT_V1` / Vite twin, default OFF |
| Eligible-device list leaks pairing codes, screenshots, or stream keys | **Critical** — public-safe owner DTO only |
| Withdraw/schedule mutates Device or Playlist rows | **High** — placements only; overlay stays read-time |
| Analytics UI sums registrations + online joins + screen plays | Product-truth — never combine |
| `playlist/full` shape change for Android / TVs | Medium — overlay fields stay additive |
| Prisma `withdrawnAt` applied on staging/production | High — pilot-only; flags default OFF |
| StoreLiveMarketPage tests fail if new flag export is unmocked | Medium — mock default false |

---

## (2) Why

Batch A stored the contract but left operators without campaign/placement controls, preview, assignment health, or separate analytics. Audience attribution exists; owner workflows do not.

---

## (3) Impact scope

**In scope:** owner Cnet APIs (list devices, schedule, withdraw, preview, health, analytics); public manifest projection by token; HLS→timed-card fallback reasons; idempotent impression/QR keys; dashboard panel on the existing Live Market owner page; tests.

**Out of scope:** Render apply, Cloudflare/OBS, production flags, billing, ad buy, unique-people claims, combining counters, WHIP/WHEP.

---

## (4) Smallest safe patch

1. Additive `withdrawnAt` on placements (nullable). No Device/Playlist writes.
2. New owner routes under existing `/api/stores/:storeId/live-cnet/...` + public `GET /manifest/:token`.
3. Overlay: if LIVE but no HLS URL → `live_card` + `STREAM_UNAVAILABLE`. Withdrawn/expired placements omitted.
4. Dashboard panel flag-gated; existing Live Market controls unchanged.
5. Metrics DTO keeps five separate counters plus a never-combine note.

No Render, Cloudflare, or OBS.
