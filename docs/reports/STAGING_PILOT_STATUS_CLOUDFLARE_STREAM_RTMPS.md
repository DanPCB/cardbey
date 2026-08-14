# STAGING PILOT STATUS — Cloudflare Stream RTMPS

Date: 2026-08-14  
ACK: `ACK CLOUDFLARE_RTMPS_STAGING_PILOT`  
Verdict: **PARTIAL**

Boundary: commits/PRs and automated verification complete; **real staging secrets, Cloudflare Notifications, deploy, and OBS second-device playback were not available in this environment**.

---

## Commits and PRs

| Item | Value |
|------|--------|
| Dashboard SHA | `80f63c166bf448eda68c76cf304b2342ce36f8dd` |
| Dashboard branch | `feat/cloudflare-stream-rtmps-pilot-ui-v3` |
| Dashboard PR | https://github.com/DanPCB/cardbey-marketing-dashboard/pull/102 |
| Core feat SHA | `c86607903fc7978659f63089fe9f186a2b48edd5` |
| Core docs SHA | `f92f36817423832b7bd33f2bf8832e5fff52c603` (HEAD) |
| Core branch | `feat/cloudflare-stream-rtmps-pilot-v3` |
| Core PR | https://github.com/DanPCB/cardbey/pull/139 |
| Parent submodule old | `e0e8dabeca09c4aebfafec9c21294b5420b832df` |
| Parent submodule new | `80f63c166bf448eda68c76cf304b2342ce36f8dd` |
| Core base | `53c7135856677f457e9b030f6bc6705c0e980840` |

## Automated verification (pre-push)

| Check | Result |
|-------|--------|
| Core Prisma validate ×3 | Pass |
| Core Prisma generate | Pass |
| Core `test:live-market` | **87 passed** |
| Boot flags off | Pass |
| Boot flags on, no provider | `not_configured` |
| Dashboard targeted tests | **46 passed** |
| Dashboard production build | Success |

## Staging deployment identifiers

Not executed (no staging deploy credentials / pipeline run from this session).  
Recommended order remains: merge dashboard PR → merge core PR → configure secrets → deploy core (flags off) → deploy dashboard → enable pilot flags for one store → OBS.

## Exact flag env names (discovered)

**Enable for approved pilot store / staging only:**

- `ENABLE_LIVE_MARKET_V1`
- `ENABLE_LIVE_MARKET_OWNER_V1`
- `ENABLE_LIVE_MARKET_PUBLIC_V1`
- `ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1`
- `ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1`
- `ENABLE_LIVE_MARKET_GLOBAL_FEED_V1`
- `ENABLE_LIVE_BROADCAST_V1`
- `ENABLE_LIVE_CLOUDFLARE_STREAM_V1`
- `ENABLE_LIVE_RTMPS_HOST_V1`
- `ENABLE_LIVE_STOREFRONT_PLAYER_V1`
- `ENABLE_LIVE_GLOBAL_PLAYER_V1`
- `LIVE_VIDEO_PROVIDER=cloudflare`

**Keep off:**

- `ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1`
- `ENABLE_LIVE_RECORDING_V1`
- `ENABLE_LIVE_REPLAY_V1`
- (chat / captions / translation — no Live Market flags present for these)

**Server secrets (secret manager only; never VITE_*):**

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN`
- `CLOUDFLARE_STREAM_CUSTOMER_CODE`
- `CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH`
- `CLOUDFLARE_STREAM_ALLOWED_ORIGINS` (exact staging domains)

## Secret/config readiness

Local/process env and `gh secret list` showed **none** of the Cloudflare staging values present in this session.  
Do not invent aliases; use names above.

## Cloudflare Notifications / OBS / audience evidence

Not run — blocked on staging secrets + deploy.

## Credential containment (code-level, verified by tests)

- Credentials endpoint: owner + flags + session gate + rate limit + `Cache-Control: no-store`
- Audit redacts stream key / rtmps patterns; no persistence of stream key
- UI clears credentials on session change, unmount, end broadcast
- Public DTO / feed playback omit RTMPS keys

## Remaining blockers for `CLOUDFLARE_STREAM_RTMPS_TECHNICAL_PILOT_READY`

1. Merge PRs #102 (dashboard) and #139 (core) to `release/live-market-global-live-stg`
2. Install staging Cloudflare secrets via secret manager
3. Deploy core then dashboard; verify with broadcast flags **off**
4. Enable pilot flags for one store
5. Configure Notifications → `/api/webhooks/cloudflare/stream-live` with `cf-webhook-auth`
6. Complete OBS checklist (steps 10–11 of ACK) on second device for storefront + global

Production remains unauthorized.
