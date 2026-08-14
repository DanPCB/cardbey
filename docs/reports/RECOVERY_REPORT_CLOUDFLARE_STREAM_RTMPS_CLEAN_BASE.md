# CLEAN-BASE RECOVERY REPORT — Cloudflare Stream RTMPS Pilot

Date: 2026-08-14  
Verdict: **RTMPS_IMPLEMENTATION_RECOVERED_ON_LIVE_MARKET_BASE**

---

## Recovery lineage (accepted)

| Item | Value |
|------|--------|
| Worktree | `C:/Projects/cardbey-wt-cloudflare-rtmps-v3` |
| Branch | `feat/cloudflare-stream-rtmps-pilot-v3` |
| Base SHA | `53c7135856677f457e9b030f6bc6705c0e980840` (`release/live-market-global-live-stg`) |
| Current HEAD | `53c7135856677f457e9b030f6bc6705c0e980840` (uncommitted RTMPS patch) |
| Pre-patch proof | HEAD equals base; Live Market tracked (20 files); mod=0 staged=0 untracked=0 |

### Names avoided (not used / not cleaned)

| Path | Reason |
|------|--------|
| `C:/Projects/cardbey-wt-cloudflare-rtmps` | Rejected lineage (wrong base `a2d239136…`); left **read-only** |
| `C:/Projects/cardbey-wt-cloudflare-rtmps-v2` | Correct base but **dirty** partial recovery; not reset |
| `C:/Projects/cardbey` / `cardbey-wt-live-core` | Untouched (per safety) |

---

## Step 1 — Inventory classification (old WT vs `53c71358`)

### Files involved in the old 80-test claim

Live Market suite + `rtmpsLifecycle.test.js` under `apps/core/cardbey-core/src/lib/liveMarket/**` plus Cloudflare provider tests.

### Carried (categories 2 / 3 / 4)

**Core — RTMPS-specific (2) + compatibility (3):**

- Adapter/config: `cloudflareStreamConfig.js`, `cloudflareStreamProvider.js` (+test), `cloudflareStreamRedact.js`, `cloudflareNotificationsAuth.js` (new)
- Lifecycle/service/routes: `domain.js`, `providers.js`, `service.js`, `routes.js`, `index.js`, `server.js`, `features.js`, `.env.example`
- Webhook/reconcile: `reconcile.js` (new), webhook routes in `routes.js`
- Public DTO: `publicPlayback.js` (new), `attachLiveMarketToPublicStores.js` (playback on global feed when `globalPlayerV1`)
- Credential redaction: `audit.js` (`streamKey`/`rtmps`/`whip`/`whep`)
- Tests: `domain.test.js`, `service.test.js`, `cloudflareStreamProvider.test.js`, `rtmpsLifecycle.test.js` (new), `package.json` script entry

**Dashboard — separate repo branch required:**

- Repo: `apps/dashboard/cardbey-marketing-dashboard` (submodule)
- Branch: `feat/cloudflare-stream-rtmps-pilot-ui-v3`
- UI foundation base: `b31c66d30169775561fbe77853fd00ab52875e55` (Live Market UI + Global Live EOI already present; **not** empty `e0e8dab`)
- RTMPS UI deltas: control-room page, storefront player gate, global feed player, feature flags, credentials unwrap, `CloudflareStreamLivePlayer.tsx`

### Rejected (categories 5 / 1 / wrong-base restore)

| Rejected | Why |
|----------|-----|
| Entire untracked `src/lib/liveMarket/**` from old WT | Already tracked on `53c71358` |
| Prisma schema / migration copies from old WT | Auth base already has Live Market + GlobalLiveEoi; recording deferred → **no schema change** |
| `resolvePublicStoreList.js` old delta | Already correct on auth base |
| Live Market Phase1 / storefront / EOI docs & migrate scripts from old WT | Foundation / unrelated |
| Old `LiveBroadcastControlPanel.tsx` | Incompatible API names; superseded by `BroadcastControlRoom` in `StoreLiveMarketPage.tsx` |
| Isolation/implementation reports from rejected lineage | Misleading base claims |
| Wholesale Live Market directory copy | Forbidden |

---

## Exact clean-base core diff (summary)

17 modified + 4 new files under `apps/core/cardbey-core` (~+1131 / −87).  
**No prisma schema/migration files changed.**

New:

- `src/lib/liveMarket/providers/cloudflareNotificationsAuth.js`
- `src/lib/liveMarket/publicPlayback.js`
- `src/lib/liveMarket/reconcile.js`
- `src/lib/liveMarket/rtmpsLifecycle.test.js`

---

## Verification results

### Core

| Check | Result |
|-------|--------|
| Prisma validate sqlite / postgres / default | Pass (with `DATABASE_URL` set) |
| Prisma generate (`prisma-generate-for-env.js` → `.prisma/client-gen`) | Pass |
| `npm run test:live-market` | **8 files / 87 tests passed** |
| Cloudflare adapter tests | Included (pass) |
| Lifecycle / auth / API integration | Included (pass) |
| Public DTO privacy (rtmpsLifecycle + provider tests) | Pass |
| Boot flags OFF | `v1/rtmps/stream = false` |
| Boot flags ON, provider missing | `cfgOk=false`, `provider=not_configured`, webhook secret missing → auth rejects |

### Dashboard

| Check | Result |
|-------|--------|
| Owner control-room / storefront / feature-flag / badge tests | **4 files / 46 tests passed** |
| Production build | **✓ built in 1m 4s** |

### Submodule requirement (explicit)

Dashboard work is **not** isolated by core alone. Parent still records submodule tip `e0e8dab…` until a deliberate submodule bump after the UI branch is committed/pushed. Working tree uses:

- Branch `feat/cloudflare-stream-rtmps-pilot-ui-v3` @ `b31c66d…` + uncommitted RTMPS UI patch

---

## Lifecycle transition evidence

Code + tests enforce:

- Prepare → `READY`
- Start-intent → `CONNECTING` (owner cannot `READY → LIVE`)
- `LIVE` only via `confirmProviderConnected` (webhook / reconcile)
- End → `ENDING` → `ENDED`; disconnect → ended path
- Fake provider `startSession` returns `connecting`, never `live`
- Publication remains separate (`storefrontPublicationStatus`); players require `PUBLISHED` + confirmed `LIVE` + valid playback

## Webhook authentication evidence

Contract: Cloudflare Notifications destination header **`cf-webhook-auth`** compared with timing-safe equality to `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH`.

- **Not** Stream video-library HMAC (`Webhook-Signature`)
- Missing secret → auth `missing_secret`; route returns 503 / not operational; **reconcile remains authoritative**
- Incorrect/missing header rejected (`LIVE_PROVIDER_EVENT_INVALID`)
- Unknown `input_id` → generic `200` (no existence leak)
- In-memory event-id dedupe for duplicate delivery
- Audits avoid raw payload / secrets

## Credential containment evidence

- Owner-only `POST …/broadcast-credentials`, rate-limited, `Cache-Control: no-store`
- Requires pilot + RTMPS flags + eligible session state + provider live input
- Stream key not persisted; audit metadata only `hasUrl`
- Dashboard clears credentials on session change, unmount, and end-broadcast
- Public/feed DTOs use `buildPublicPlaybackDto` (no RTMPS/key/account)

## Audience surfaces

| Surface | Status |
|---------|--------|
| `/s/:slug#live` storefront | Player via `ScheduledLiveCard` + `LivePlayerContainer`; gated by `ENABLE_LIVE_STOREFRONT_PLAYER_V1` + published + confirmed LIVE + playback |
| Global Marketplace feed | Player embed on `ArtifactCard` when `ENABLE_LIVE_GLOBAL_PLAYER_V1` + feed summary `playback` from `attachLiveMarketToPublicStores`; withdraw/cancel removes published/LIVE summary |

No fake viewer count.

---

## Remaining before real Cloudflare / OBS

1. Commit core branch + dashboard UI branch; bump monorepo submodule pointer intentionally  
2. Staging secrets only (never commit): `CLOUDFLARE_ACCOUNT_ID`, Stream API token, `CLOUDFLARE_STREAM_CUSTOMER_CODE`, `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH`, RTMPS/player flags  
3. Configure Cloudflare Notifications webhook → `/api/webhooks/cloudflare/stream-live` with `cf-webhook-auth`  
4. OBS: server URL + stream key from credentials endpoint only; second-device playback validation  
5. Do **not** use the rejected `cardbey-wt-cloudflare-rtmps` worktree for deploy

---

## Note on incidental Prisma client pollution

A temporary `node_modules` junction briefly caused `prisma generate` to write into `C:/Projects/cardbey/.../@prisma/client`. That junction was removed; v3 now has a **local** `node_modules` + `client-gen`. If main’s generated client looks odd, regenerate from main’s own schema in that worktree when convenient (no source edits required).
