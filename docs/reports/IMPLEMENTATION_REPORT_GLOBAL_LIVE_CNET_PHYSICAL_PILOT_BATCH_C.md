# IMPLEMENTATION REPORT — Global Live × Cnet physical pilot (Batch C)

Date: 2026-08-18  
ACK: `ACK GLOBAL_LIVE_CNET_PHYSICAL_PILOT_BATCH_C`  
Worktree: `C:\Projects\cardbey-wt-live-cnet-contract`  
Overall verdict: **PARTIAL**

`GLOBAL_LIVE_CNET_PHYSICAL_PILOT_READY` is **not** claimed.

This batch was **not** combined with the dirty WHIP/WHEP worktree. Staging and production were not deployed or migrated.

---

## What this session can complete vs what stays operator-physical

| Batch C item | Status |
|--------------|--------|
| Review + commit/push isolated A/B | This session (git) |
| Dedicated pilot PRs (not staging/main) | This session (draft PRs vs RTMPS v3 feat branches) |
| Dedicated Render blueprint `autoDeploy: false` | File ready; **apply is operator/Render Dashboard** — do not apply `render.yaml` |
| Migrations via approved `prisma migrate deploy` | Only against a **new** pilot Postgres after it exists |
| Server-only Cloudflare credentials | Names documented; values stay in Render secret manager |
| Required pilot flags | Listed in runbook; first deploy remains **false** |
| Pair screen / OBS / HLS / QR / metrics evidence | **Blocked** until dedicated services + secrets + physical devices exist |

---

## Stop conditions (still in force)

Owner action → LIVE; unverified Cloudflare; credentials in logs/storage/public DTOs; internal IDs on manifest; no HLS fallback; duplicate telemetry; combined viewer totals; staging/production deploy.

---

## Isolation guarantees

- Dirty monorepo `C:\Projects\cardbey` not patched for Live Market / Cloudflare / WHIP.
- Repo-root `render.yaml` (staging/main services) not edited.
- No production flags enabled in git.

---

## Commits and PRs

| Git | Value |
|-----|--------|
| Core SHA | `43a9175a5a4fe05c8d13b8ed8cac1e7c40cd0f54` |
| Core branch | `feat/global-live-cnet-commercial-contract-a` |
| Core draft PR | https://github.com/DanPCB/cardbey/pull/153 (base `feat/cloudflare-stream-rtmps-pilot-v3`, **not** staging/main) |
| Dashboard SHA | `9ef832fed867cd786cebd80fe6cb99917ef6f3b3` |
| Dashboard branch | `feat/global-live-cnet-commercial-contract-a` |
| Dashboard draft PR | https://github.com/DanPCB/cardbey-marketing-dashboard/pull/106 (base `feat/cloudflare-stream-rtmps-pilot-ui-v3`, **not** staging/main) |

---

## Evidence log

| Check | Result |
|-------|--------|
| Automated A/B tests (prior session) | live-cnet 23, live-market 87, display-runtime 50, webOS 38, dashboard 47 |
| Render apply this session | **Not executed** — `RENDER_API_KEY` unset; applying repo-root `render.yaml` is forbidden |
| Render CLI present | `render` exists locally; no authenticated apply |
| Pilot migrate | **Not executed** (no new DATABASE_URL in this environment) |
| OBS READY→CONNECTING→LIVE | **Not executed** |
| Physical HLS + QR attribution | **Not executed** |

Until the runbook evidence table is complete, verdict remains **PARTIAL**.
