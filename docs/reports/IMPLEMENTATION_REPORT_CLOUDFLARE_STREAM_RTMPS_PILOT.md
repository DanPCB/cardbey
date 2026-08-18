# IMPLEMENTATION REPORT — Cloudflare Stream RTMPS Pilot

Date: 2026-08-15  
Worktree: `C:/Projects/cardbey-wt-cloudflare-rtmps`  
Branch: `feat/cloudflare-stream-rtmps-pilot`  
Base SHA: `a2d23913639cf5a8d31c6377b80dcc87271de330` (`release/live-market-global-live-stg`)  
Dashboard UI branch (submodule): `feat/cloudflare-stream-rtmps-pilot-ui`  
**Verdict: PARTIAL**

Isolation manifest: `docs/reports/ISOLATION_MANIFEST_CLOUDFLARE_STREAM_RTMPS_PILOT.md`

---

## Verdict rationale

Mocked Core + lifecycle suites are green. RTMPS adapter, CONNECTING→LIVE invariant, Notifications `cf-webhook-auth`, credentials endpoint, reconcile, public playback DTO, owner control panel, and storefront player wiring are implemented.

**Not claimed:**

- `CLOUDFLARE_STREAM_RTMPS_TECHNICAL_PILOT_READY` (no real OBS + second-device evidence)
- Recording / replay / 24h deletion
- Browser WHIP/WHEP
- Chat / captions / translation
- Production streaming operational

Staging Cloudflare credentials were not injected in this session → real provider validation stopped (as approved).

---

## Isolation confirmation

| Item | Status |
|------|--------|
| Clean worktree | `C:/Projects/cardbey-wt-cloudflare-rtmps` |
| Base commit | `a2d23913639cf5a8d31c6377b80dcc87271de330` |
| Main dirty tree (`C:/Projects/cardbey`, ~338 paths) | Untouched by RTMPS coding |
| EOI / BI enrichment | Not copied into this worktree |
| Recording schema hooks | Deferred (flags off; no speculative persistence) |

---

## Exact files changed (Core — primary)

### Provider / auth

- `apps/core/cardbey-core/src/lib/liveMarket/providers/cloudflareStreamConfig.js`
- `apps/core/cardbey-core/src/lib/liveMarket/providers/cloudflareStreamProvider.js`
- `apps/core/cardbey-core/src/lib/liveMarket/providers/cloudflareStreamProvider.test.js`
- `apps/core/cardbey-core/src/lib/liveMarket/providers/cloudflareStreamRedact.js`
- `apps/core/cardbey-core/src/lib/liveMarket/providers/cloudflareNotificationsAuth.js` **(new)**
- `apps/core/cardbey-core/src/lib/liveMarket/providers.js`
- `apps/core/cardbey-core/src/lib/liveMarket/reconcile.js` **(new)**
- `apps/core/cardbey-core/src/lib/liveMarket/rtmpsLifecycle.test.js` **(new)**

### Lifecycle / APIs

- `domain.js` / `domain.test.js` — `CONNECTING`, `ENDING`; `toPublicPlaybackDto`
- `service.js` — prepare audit; `startSessionIntent` → CONNECTING; `confirmProviderConnected/Disconnected`; credentials; capabilities; provider-state
- `routes.js` — start-intent, broadcast-capabilities, provider-state, broadcast-credentials (no-store), playback, webhook export, admin reconcile
- `audit.js`, `index.js`, `server.js`, `features.js`, `.env.example`, `package.json`
- Prisma schemas + Live Market migrations restored (no EOI models)

### Dashboard (submodule)

- `LiveBroadcastControlPanel.tsx`, `CloudflareStreamLivePlayer.tsx`
- `featureFlags.ts`, `api.ts`, `StoreLiveMarketPage.tsx`, `ScheduledLiveCard.tsx`
- Restored Live Market foundation UI from dirty tree (isolated copy)

---

## Provider API contract

```text
POST   /accounts/{accountId}/stream/live_inputs
GET    /accounts/{accountId}/stream/live_inputs/{uid}
PUT    /accounts/{accountId}/stream/live_inputs/{uid}   # enabled
DELETE /accounts/{accountId}/stream/live_inputs/{uid}
GET    /accounts/{accountId}/stream/live_inputs/{uid}/videos
Playback: customer-{code}.cloudflarestream.com/{uid}/iframe|manifest/video.m3u8
```

`providerExternalRef` = Live Input UID only. RTMPS URL/key only via `POST …/broadcast-credentials`.

---

## Lifecycle transition table

| From | To | Trigger |
|------|-----|---------|
| SCHEDULED | READY | Owner prepare (creates Live Input) |
| READY | CONNECTING | Owner start-intent only |
| CONNECTING | LIVE | Cloudflare connected (webhook or reconcile) — **never owner click** |
| LIVE / CONNECTING | ENDING | Owner end |
| ENDING | ENDED | Provider disabled / disconnect evidence |
| LIVE / ENDING | ENDED | Disconnect / error reconcile |
| CONNECTING | READY | Disconnect before confirmed live |
| ENDED | PROCESSING | Reserved (recording deferred) |

Invariant enforced: `READY → LIVE` rejected by transition map.

---

## Authorization matrix

| Actor | Prepare / start-intent / credentials / end | Public playback | Admin reconcile |
|-------|--------------------------------------------|-----------------|-----------------|
| Owner + ACTIVE pilot + flags | Yes | N/A | No |
| Owner PAUSED | Edit/cancel only | N/A | No |
| Non-owner | Deny | N/A | No |
| Admin | Health + reconcile; no RTMPS credentials | N/A | Yes |
| Audience | No | Published + confirmed LIVE + player flags | No |

---

## Sensitive credential handling

- Issued only by `POST /api/stores/:storeId/live-sessions/:sessionId/broadcast-credentials`
- Auth + store owner + ACTIVE pilot + RTMPS host flags + prepared session
- Rate limited; `Cache-Control: no-store`
- Never persisted in DB; never in list/status/public DTOs; never in audit metadata
- UI: React state only; clear on unmount / session change / explicit clear

---

## Webhook authenticity

- **Method:** Cloudflare Notifications destination secret via `cf-webhook-auth` header (timing-safe compare)
- **Not used for Live Input:** Stream video-library HMAC (`Webhook-Signature`)
- Route: `POST /api/webhooks/cloudflare/stream-live`
- **Inactive** unless `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH` is set → 404
- Temporary authority when inactive: authenticated server-side `reconcileLiveProviderSessions` (+ admin `POST /api/admin/live-market/reconcile-provider`)

---

## Reconciliation design

- Polls `READY|CONNECTING|LIVE|ENDING` with `providerExternalRef`
- Per-run lock + provider-call budget
- CONNECTING + provider `live` → LIVE
- LIVE/ENDING + disconnected/ended/failed → ENDING→ENDED
- Never promotes from schedule time alone
- In-memory event-id dedupe for webhooks (24h TTL)

---

## Public playback DTO

```json
{
  "state": "WAITING|CONNECTING|LIVE|ENDED|REPLAY_PROCESSING|REPLAY_READY|UNAVAILABLE",
  "sessionId": "…",
  "live": false,
  "playerUrl": null,
  "videoId": null,
  "startedAt": null,
  "endedAt": null,
  "replayAvailable": false
}
```

Player only when consume player flag + `PUBLISHED` + confirmed `LIVE` + `playerUrl`. Withdrawal → `UNAVAILABLE` (no player).

---

## Feature-flag matrix

| Flag | Default | Role |
|------|---------|------|
| ENABLE_LIVE_BROADCAST_V1 | false | Transport gate |
| ENABLE_LIVE_CLOUDFLARE_STREAM_V1 | false | Provider select |
| ENABLE_LIVE_RTMPS_HOST_V1 | false | Host prepare/credentials unlock |
| ENABLE_LIVE_STOREFRONT_PLAYER_V1 | false | `/s/:slug` player |
| ENABLE_LIVE_GLOBAL_PLAYER_V1 | false | Global surface player |
| ENABLE_LIVE_RECORDING_V1 | false | Deferred |
| ENABLE_LIVE_REPLAY_V1 | false | Deferred |
| ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1 | false | Deferred |

Matching `VITE_*` for UI only.

Config (server-only): `LIVE_VIDEO_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE`, `CLOUDFLARE_STREAM_ALLOWED_ORIGINS`, `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH`, `CLOUDFLARE_STREAM_WEBHOOK_SECRET` (library HMAC reserved; not Live Input).

---

## Audit events (redacted)

`LIVE_BROADCAST_PREPARED`, `LIVE_BROADCAST_CREDENTIALS_ISSUED`, `LIVE_BROADCAST_START_INTENT`, `LIVE_PROVIDER_CONNECTED`, `LIVE_PROVIDER_DISCONNECTED`, `LIVE_PROVIDER_ERROR`, `LIVE_BROADCAST_ENDED`, `LIVE_PROVIDER_RECONCILED`

---

## Prisma / migrations

- Restored Live Market foundation models + 4 migrations (sqlite + postgres)
- **No** recording persistence columns
- **No** historical migration edits
- **No** EOI schema in this worktree

---

## Automated test results

```text
npm run test:live-market
Test Files  8 passed (8)
Tests       80 passed (80)
```

Includes Cloudflare RTMPS mocks, Notifications auth, lifecycle DTO scrubbing, existing Live Market suites.

---

## Production build result

Not run in this batch (dashboard submodule freshly checked out; deps not fully installed in worktree). Core mocked suite is the gate completed for PARTIAL.

---

## Real Cloudflare pilot evidence

**Not performed** — staging secrets unavailable in this session. Next steps when authorised:

1. Configure staging-only Stream token + Notifications webhook auth
2. Enrol test store → publish → prepare → OBS RTMPS → CONNECTING → LIVE
3. Second-device storefront `#live` + global surface
4. Withdraw/republish/end checks
5. Confirm no credential leakage

---

## Remaining blockers

1. Staging Cloudflare Stream account/token + Notifications destination secret
2. Dashboard production build + Live Market dashboard vitest in submodule
3. Global Marketplace dedicated player mount (API `surface=global` ready; storefront player wired; global surface still primarily routes to `/s/:slug#live`)
4. Real OBS/second-device evidence for ready verdict
5. Separate batch for recording/replay/24h deletion

---

## Explicit non-claims

Recording, replay, WHIP/WHEP, chat, captions, translation, and production operational streaming are **not** operational in this batch.
