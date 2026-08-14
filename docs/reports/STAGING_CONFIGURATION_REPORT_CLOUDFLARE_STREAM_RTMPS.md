# STAGING CONFIGURATION REPORT — Cloudflare Stream RTMPS

Date: 2026-08-14  
ACK: `ACK CLOUDFLARE_RTMPS_STAGING_CONFIGURATION`  
Verdict: **PARTIAL**

## Stop reason (merge / deploy / OBS not executed)

1. **Core PR #139 CI is red** (same class of failures as base `53c713585` / merged PR #136). Per “required CI checks pass”, merge was **not** performed.
2. **No Cloudflare staging credentials** available to this agent; cannot configure Stream / Notifications / OBS.
3. **Render Environment** is the secret destination; no authenticated Render admin API in this session (`render-cli` npm package is unrelated templating, not Render.com).

Production was not touched.

---

## 1. PR review

### Dashboard PR #102 — https://github.com/DanPCB/cardbey-marketing-dashboard/pull/102

| Check | Result |
|-------|--------|
| Scope | Live Market RTMPS UI only (12 files); no EOI/BI/enrichment |
| Commit | `80f63c166bf448eda68c76cf304b2342ce36f8dd` |
| CI | No checks reported on branch |
| Credentials / `.env` / PII / DBs | None in diff |
| Players | Storefront + global Marketplace present |
| Credential UI | Clears on session change / unmount / end |

### Core PR #139 — https://github.com/DanPCB/cardbey/pull/139

| Check | Result |
|-------|--------|
| Scope | Live Market RTMPS + docs + submodule bump only |
| Submodule pointer | **Exact** `80f63c166bf448eda68c76cf304b2342ce36f8dd` |
| Migrations / schema | **Unchanged** |
| Recording / replay / WebRTC | Flags default **false** |
| Owner → LIVE | Impossible (`READY↛LIVE`; start-intent → `CONNECTING`) |
| Credentials route | Owner + rate limit + `Cache-Control: no-store` |
| Public DTOs | `buildPublicPlaybackDto` — no RTMPS/keys |
| CI | **FAIL** — see below |

### CI failure class (pre-existing on base)

Observed on PR #139 **and** on base SHA `53c713585` / merged PR #136:

| Failure | Cause |
|---------|--------|
| Core unit / Tests | Missing monorepo `node_modules/tsx/dist/loader.mjs` |
| Secret preflight / Render readiness | Submodule not checked out → missing `apps/dashboard/.../package.json` |
| Contract Tests | `prisma migrate diff` requires `--shadow-database-url` |

**Local release gate (already green):** Prisma validate ×3, generate, `test:live-market` 87, dashboard 46 + production build.

Prior Live Market staging PRs were merged with the same red checks and **no branch protection** on `release/live-market-global-live-stg`. Explicit human override is still required before this agent merges.

---

## 2. Authoritative secret / deploy destination

| Item | Value |
|------|--------|
| Platform | **Render** |
| Core service | `cardbey-core-staging` ← monorepo branch **`staging`** |
| Dashboard service | `cardbey-dashboard-staging` ← monorepo branch **`staging`** |
| Secrets enter | **Render Dashboard → Environment** (not GitHub Environments; `total_count: 0`) |
| Staging URLs | `https://cardbey-core-staging.onrender.com` · `https://cardbey-dashboard-staging.onrender.com` |
| Deploy trigger | Push/merge to **`staging`** (auto-deploy). Merging only to `release/live-market-global-live-stg` does **not** deploy Render. |
| Blueprint | `render.yaml`, `docs/DEPLOYMENT_PROMOTION.md` |

---

## 3–4. Webhook secret classification

| Variable | Cloudflare system | Consumed by RTMPS Live Input route? | Staging required? | Notes |
|----------|-------------------|--------------------------------------|-------------------|--------|
| `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH` | **Notifications** destination header `cf-webhook-auth` | **Yes** — `/api/webhooks/cloudflare/stream-live` | **Yes** for webhook-driven LIVE/ENDED | Missing → auth fails / route not operational; **reconcile remains authoritative** |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | Stream **video-library** HMAC (`Webhook-Signature`) | **No** for Live Input Notifications route | **Optional / legacy Slice A** | Used by provider `verifyWebhook()` HMAC helper only; **do not** reuse for Notifications |

Do **not** put either secret in `VITE_*` or URLs.

---

## 5. Required staging server configuration (names only)

Enter on **Render → `cardbey-core-staging` → Environment**:

```text
LIVE_VIDEO_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=<secret>
CLOUDFLARE_STREAM_API_TOKEN=<secret>
CLOUDFLARE_STREAM_CUSTOMER_CODE=<config>
CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH=<secret>
CLOUDFLARE_STREAM_ALLOWED_ORIGINS=https://cardbey-dashboard-staging.onrender.com
```

Optional (legacy video-library HMAC only): `CLOUDFLARE_STREAM_WEBHOOK_SECRET`

Never create any `VITE_CLOUDFLARE_*` variable.

Notifications destination URL:

`https://cardbey-core-staging.onrender.com/api/webhooks/cloudflare/stream-live`

---

## 6. Exact flag matrix

### Core (`cardbey-core-staging` Environment)

| Exact variable | Side | Pilot value | Dependency | Purpose |
|----------------|------|-------------|------------|---------|
| `ENABLE_LIVE_MARKET_V1` | Core | `true` | — | Master kill switch |
| `ENABLE_LIVE_MARKET_OWNER_V1` | Core | `true` | master | Owner control room APIs |
| `ENABLE_LIVE_MARKET_PUBLIC_V1` | Core | `true` | master | Public Live Market routes |
| `ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1` | Core | `true` | master | Publish/withdraw |
| `ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1` | Core | `true` | master | Storefront consume |
| `ENABLE_LIVE_MARKET_GLOBAL_FEED_V1` | Core | `true` | master | Global feed projection |
| `ENABLE_LIVE_BROADCAST_V1` | Core | `true` | master | Broadcast foundation |
| `ENABLE_LIVE_CLOUDFLARE_STREAM_V1` | Core | `true` | broadcast | Cloudflare Stream adapter |
| `ENABLE_LIVE_RTMPS_HOST_V1` | Core | `true` | stream | RTMPS credentials / prepare unlock |
| `ENABLE_LIVE_STOREFRONT_PLAYER_V1` | Core | `true` **after** smoke | storefront consume | Storefront player media |
| `ENABLE_LIVE_GLOBAL_PLAYER_V1` | Core | `true` **after** smoke | global feed | Global player media |
| `LIVE_VIDEO_PROVIDER` | Core | `cloudflare` | — | Provider selection |
| `ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1` | Core | `false` | — | WebRTC off |
| `ENABLE_LIVE_RECORDING_V1` | Core | `false` | — | Recording off |
| `ENABLE_LIVE_REPLAY_V1` | Core | `false` | — | Replay off |

Initial deploy recommendation: set player flags **`false`** until provider smoke passes, then enable for the pilot store window.

### Dashboard build-time (`cardbey-dashboard-staging` Environment)

Must be set **before** staging dashboard build (Vite bake-in):

| Exact variable | Side | Pilot value | Purpose |
|----------------|------|-------------|---------|
| `VITE_ENABLE_LIVE_MARKET_V1` | Dashboard | `true` | Master UI |
| `VITE_ENABLE_LIVE_MARKET_OWNER_V1` | Dashboard | `true` | Owner UI |
| `VITE_ENABLE_LIVE_MARKET_PUBLIC_V1` | Dashboard | `true` | Public surfaces |
| `VITE_ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1` | Dashboard | `true` | Publish controls |
| `VITE_ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1` | Dashboard | `true` | `/s/:slug#live` card |
| `VITE_ENABLE_LIVE_MARKET_GLOBAL_FEED_V1` | Dashboard | `true` | Feed badge / player host |
| `VITE_ENABLE_LIVE_BROADCAST_V1` | Dashboard | `true` | Broadcast UI gate |
| `VITE_ENABLE_LIVE_CLOUDFLARE_STREAM_V1` | Dashboard | `true` | Stream UI gate |
| `VITE_ENABLE_LIVE_RTMPS_HOST_V1` | Dashboard | `true` | OBS control room |
| `VITE_ENABLE_LIVE_STOREFRONT_PLAYER_V1` | Dashboard | match core | Storefront player |
| `VITE_ENABLE_LIVE_GLOBAL_PLAYER_V1` | Dashboard | match core | Global player |

Keep unset/false: any WebRTC / recording / replay Vite flags if present (none required for pilot).

---

## 7. Merge and deploy (not executed)

Intended order once CI override + Cloudflare secrets exist:

1. Merge dashboard PR #102 → `release/live-market-global-live-stg`
2. Confirm core still points at `80f63c16…`
3. Merge core PR #139 → `release/live-market-global-live-stg`
4. Promote/merge that tip into monorepo **`staging`** (Render auto-deploy)
5. Set Render secrets + flags (players off first)
6. Verify core health
7. Redeploy dashboard if VITE flags changed after first build
8. Enable player flags → OBS pilot

**Merge SHAs / deployment IDs:** *n/a — not merged/deployed*

---

## 8–11. Provider smoke / Notifications / OBS / two-surface

**Not run** — blocked on merge + Render secrets + Cloudflare admin setup.

### Cloudflare admin checklist (human)

- [ ] Stream subscription + staging account ID + customer code  
- [ ] Staging-only API token: Account Stream **Read** + **Edit** (not Global API Key)  
- [ ] Allowed origins = exact staging dashboard origin(s)  
- [ ] Notifications webhook → staging core `/api/webhooks/cloudflare/stream-live` with `cf-webhook-auth` = `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH`  
- [ ] Do **not** use `CLOUDFLARE_STREAM_WEBHOOK_SECRET` for Notifications  

### OBS (when ready)

Custom service; Server = Cardbey RTMPS URL; Stream key = Cardbey credentials endpoint; H.264 + AAC; keyframe ~2–4s. **Never paste key into reports.**

---

## Remaining blockers for `CLOUDFLARE_STREAM_RTMPS_TECHNICAL_PILOT_READY`

1. Explicit approval to merge despite red CI (pre-existing), **or** fix CI submodule/`tsx`/shadow-DB  
2. Cloudflare admin creates Stream token + Notifications destination  
3. Enter secrets/flags on Render `cardbey-core-staging` / `cardbey-dashboard-staging`  
4. Merge PRs → promote to **`staging`** → deploy  
5. Provider smoke → Notifications tests → OBS two-surface pilot + cleanup  

---

## Final verdict

**PARTIAL**

Code/PRs remain release candidates; staging runtime configuration and real OBS verification are blocked on CI policy + Cloudflare/Render admin actions outside this session.
